class MockSource extends ComicSource {
  name = "Mock Source";

  key = "mock";

  version = "1.0.0";

  url = "mock://source";

  settings = {
    resultCount: {
      title: "Result Count",
      type: "input",
      default: 6,
    },
    cookieEchoUrl: {
      title: "Cookie Echo URL",
      type: "input",
      default: "",
    },
    imageFallbackUrl: {
      title: "Image Fallback URL",
      type: "input",
      default: "",
    },
    imageErrorUrl: {
      title: "Image Error URL",
      type: "input",
      default: "",
    },
  };

  search = {
    load: async (keyword, options, page) => {
      if (keyword === "api-alias") {
        return {
          comics: [
            {
              id: "api-alias",
              title: `${APP.version}:${app.version}:${Boolean(Http.get)}:${Boolean(Storage.loadData)}`,
              cover: "mock://cover/api-alias",
            },
          ],
          maxPage: 1,
        };
      }
      if (keyword === "cookie-check") {
        const response = await Network.request(this.loadSetting("cookieEchoUrl"));
        return {
          comics: [
            { id: "cookie-check", title: response.text, cover: "mock://cover/cookie-check" },
          ],
          maxPage: 1,
        };
      }
      if (keyword === "data-save") {
        await Data.save("workerValue", "saved");
        return {
          comics: [
            {
              id: "data-save",
              title: await Data.load("workerValue"),
              cover: "mock://cover/data-save",
            },
          ],
          maxPage: 1,
        };
      }
      if (keyword === "data-read") {
        return {
          comics: [
            {
              id: "data-read",
              title: await Data.load("workerValue"),
              cover: "mock://cover/data-read",
            },
          ],
          maxPage: 1,
        };
      }
      const resultCount = Number(this.loadSetting("resultCount") || 6);
      return {
        comics: Array.from({ length: resultCount }, (_, offset) => offset + 1).map((index) => ({
          id: `mock-comic-${index}`,
          title: `Mock ${keyword || "Comic"} ${index}`,
          cover: `mock://cover/${index}`,
          description: `Mock comic ${index}`,
          tags: ["mock", `page-${page}`],
        })),
        maxPage: 1,
      };
    },
    optionList: [],
  };

  comic = {
    loadInfo: async (id) => {
      return new ComicDetails({
        title: `Mock Comic ${id}`,
        cover: `mock://cover/${id}`,
        description: "Offline mock comic details.",
        tags: {
          Type: ["mock"],
          Status: ["offline"],
        },
        chapters: new Map([
          ["chapter-1", "Chapter 1"],
          ["chapter-2", "Chapter 2"],
          ["chapter-3", "Chapter 3"],
        ]),
      });
    },
    loadEp: async (comicId, epId) => {
      return {
        images: [1, 2, 3, 4, 5].map((index) => `mock://image/${comicId}/${epId}/${index}`),
      };
    },
    getImageLoadingConfig: (imageKey) => {
      if (imageKey === "hook://fallback") return { url: "bad://image" };
      if (imageKey === "hook://response") return { url: this.loadSetting("imageErrorUrl") };
      if (imageKey === "hook://modify") return { url: this.loadSetting("imageFallbackUrl") };
      return {};
    },
    onLoadFailed: (imageKey) => {
      if (imageKey === "hook://fallback") return { url: this.loadSetting("imageFallbackUrl") };
      return {};
    },
    onResponse: (imageKey) => {
      if (imageKey === "hook://response") return { url: this.loadSetting("imageFallbackUrl") };
      return {};
    },
    modifyImage: (imageKey, comicId, epId, data) => {
      if (imageKey === "hook://modify") return Array.from(data).reverse();
      return data;
    },
  };
}
