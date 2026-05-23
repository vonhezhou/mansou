class MockSource extends ComicSource {
    name = "Mock Source"

    key = "mock"

    version = "1.0.0"

    url = "mock://source"

    settings = {
        resultCount: {
            title: "Result Count",
            type: "input",
            default: 6,
        },
    }

    search = {
        load: async (keyword, options, page) => {
            const resultCount = Number(this.loadSetting("resultCount") || 6)
            return {
                comics: Array.from({ length: resultCount }, (_, offset) => offset + 1).map((index) => ({
                    id: `mock-comic-${index}`,
                    title: `Mock ${keyword || "Comic"} ${index}`,
                    cover: `mock://cover/${index}`,
                    description: `Mock comic ${index}`,
                    tags: ["mock", `page-${page}`],
                })),
                maxPage: 1,
            }
        },
        optionList: [],
    }

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
            })
        },
        loadEp: async (comicId, epId) => {
            return {
                images: [1, 2, 3, 4, 5].map((index) => `mock://image/${comicId}/${epId}/${index}`),
            }
        },
    }
}
