"""在独立 Docker 容器中验证生产鉴权，不读取或更改已有管理员。"""
import argparse
import http.cookiejar
import json
import os
import pathlib
import secrets
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--image", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
directory = tempfile.mkdtemp(prefix="mansou-auth-acceptance-")
name = "mansou-auth-acceptance-" + secrets.token_hex(4)
with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
origin = "http://127.0.0.1:" + str(port)
plain = urllib.request.build_opener(urllib.request.ProxyHandler({}))
jar = http.cookiejar.CookieJar()
session = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(jar))
report = {"image": args.image, "checks": {}, "passed": False}


def docker(*command, **options):
    return subprocess.run(["docker", *command], check=True, text=True, capture_output=True, timeout=40, **options).stdout


def call(path, method="GET", payload=None, headers=None, opener=plain):
    request = urllib.request.Request(origin + "/api/v1" + path, method=method, headers=headers or {}, data=None if payload is None else json.dumps(payload).encode())
    if payload is not None:
        request.add_header("content-type", "application/json")
    try:
        response = opener.open(request, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, json.load(response)


def ready():
    for _ in range(40):
        try:
            if call("/health")[0] == 200:
                return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.5)
    raise RuntimeError("鉴权验收容器未就绪")


def expect(key, result, status):
    report["checks"][key] = result[0]
    assert result[0] == status, f"{key}: expected {status}, got {result[0]}"
    return result[1]


try:
    command = ["run", "--detach", "--rm", "--name", name, "--network", "host", "--user", f"{os.getuid()}:{os.getgid()}", "--mount", f"type=bind,src={directory},dst=/data"]
    environment = {"AUTH_MODE": "required", "AUTH_ORIGIN": origin, "HOST": "127.0.0.1", "PORT": str(port), "MANSOU_DATA_DIR": "/data"}
    for key, value in environment.items():
        command.extend(["--env", key + "=" + value])
    docker(*command, args.image)
    ready()
    expect("anonymousNovelRead", call("/novels/sources"), 401)
    expect("anonymousNovelWrite", call("/novels/sources/import", "POST", {"sources": {}}), 401)
    password = secrets.token_urlsafe(32)
    # 仅为临时数据创建管理员；密码从 stdin 传入，不进入参数、日志或报告。
    setup = """import {readFileSync} from 'node:fs';
import {createStorage} from '@mansou/storage';
import {hashPassword} from './dist/auth/password.js';
const {password}=JSON.parse(readFileSync(0,'utf8'));
const storage=createStorage('/data');
try { storage.auth.createAdmin('acceptance',await hashPassword(password)); } finally { storage.close(); }
"""
    docker("exec", "-i", name, "node", "--input-type=module", "-e", setup, input=json.dumps({"password": password}))
    logged = expect("login", call("/auth/login", "POST", {"username": "acceptance", "password": password}, {"origin": origin}, session), 200)
    headers = {"origin": origin, "x-csrf-token": logged["csrfToken"]}
    expect("sessionRead", call("/novels/sources", opener=session), 200)
    source = {"sources": {"bookSourceName": "鉴权夹具", "bookSourceUrl": "https://auth-fixture.invalid", "searchUrl": "/search?q={{key}}", "ruleSearch": {"bookList": ".book", "name": "a@text", "bookUrl": "a@href"}}}
    expect("missingCsrf", call("/novels/sources/import", "POST", source, {"origin": origin}, session), 403)
    expect("foreignOrigin", call("/novels/sources/import", "POST", source, {**headers, "origin": "https://foreign.invalid"}, session), 403)
    expect("validNovelImport", call("/novels/sources/import", "POST", source, headers, session), 200)
    token = expect("createToken", call("/auth/tokens", "POST", {"name": "acceptance"}, headers, session), 200)
    expect("tokenRead", call("/novels/sources", headers={"authorization": "Bearer " + token["token"]}), 200)
    expect("revokeToken", call("/auth/tokens/" + token["entry"]["id"], "DELETE", headers=headers, opener=session), 200)
    expect("revokedTokenRejected", call("/novels/sources", headers={"authorization": "Bearer " + token["token"]}), 401)
    docker("restart", "--time", "10", name)
    ready()
    restored = expect("sessionAfterRestart", call("/auth/session", opener=session), 200)
    assert restored["authenticated"], "重启后持久化会话应继续有效"
    expect("logout", call("/auth/logout", "POST", {}, headers, session), 200)
    expect("loggedOutRejected", call("/novels/sources", opener=session), 401)
    report["runtime"] = json.loads(docker("exec", name, "node", "-p", "JSON.stringify({node:process.version,platform:process.platform,arch:process.arch})"))
    report["passed"] = True
except Exception as error:
    report["error"] = str(error)
    raise
finally:
    subprocess.run(["docker", "rm", "--force", name], capture_output=True, timeout=30)
    shutil.rmtree(directory)
    output = pathlib.Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"report": str(output), "passed": report["passed"]}))
