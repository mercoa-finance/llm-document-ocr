import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { pdf as pdfToImg } from "pdf-to-img";
import { cropImage } from "./cropImage";
const dJSON = require("dirty-json");

export enum PageOptions {
  ALL = "ALL",
  FIRST = "FIRST",
  LAST = "LAST",
  FIRST_AND_LAST = "FIRST_AND_LAST",
}

export class DocumentOcr {
  apiKey: string;
  model: string;
  standardFontDataUrl: string;
  debug: boolean;

  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    model = "gpt-4-turbo",
    standardFontDataUrl = "https://unpkg.com/pdfjs-dist@3.2.146/standard_fonts/",
    debug = false,
  }: {
    apiKey?: string;
    model?:
      | "gpt-4-turbo"
      | "gpt-4-vision-preview"
      | "claude-3-opus-20240229"
      | "claude-3-sonnet-20240229"
      | "claude-3-haiku-20240307";
    standardFontDataUrl?: string;
    debug?: boolean;
  }) {
    if (!apiKey) {
      throw new Error("OCR API Key is not defined");
    }
    this.apiKey = apiKey;
    this.model = model;
    this.standardFontDataUrl = standardFontDataUrl;
    this.debug = debug;
  }

  process = async ({
    document,
    mimeType,
    prompt,
    pageOptions = PageOptions.ALL,
    multiplePasses = false,
  }: {
    document: string | Buffer;
    mimeType:
      | "image/png"
      | "image/jpeg"
      | "image/jpg"
      | "image/webp"
      | "image/gif"
      | "application/pdf";
    prompt: string;
    pageOptions?: PageOptions;
    multiplePasses?: boolean;
  }) => {
    if (this.debug) {
      console.time("process");
    }
    // remove the data:image/xxx;base64, prefix if it exists
    if (typeof document === "string" && document.indexOf(",") > 0) {
      if (this.debug) console.log("Removing data:xxx/xxx;base64, prefix");
      document = document.split(",")[1];
    }

    const buffer = Buffer.isBuffer(document)
      ? document
      : Buffer.from(document, "base64");

    // Array of image data to send to LLM
    const imageData: Array<Buffer> = [];

    // convert pdf to images
    if (mimeType === "application/pdf") {
      if (this.debug) console.log("Converting PDF to images");
      try {
        const pdfPages = await pdfToImg(buffer, {
          scale: 2,
          docInitParams: {
            disableFontFace: true,
            standardFontDataUrl: this.standardFontDataUrl,
          },
        });
        if (this.debug) {
          console.log(
            `PDF has ${pdfPages.length} pages. Converting to images.`
          );
        }
        const numPages = pdfPages.length;
        let currentPage = 0;
        for await (const page of pdfPages) {
          if (
            pageOptions === PageOptions.FIRST ||
            pageOptions === PageOptions.FIRST_AND_LAST
          ) {
            if (currentPage === 0) {
              imageData.push(page);
            }
          }
          if (
            pageOptions === PageOptions.LAST ||
            pageOptions === PageOptions.FIRST_AND_LAST
          ) {
            if (currentPage === numPages - 1) {
              imageData.push(page);
            }
          }
          if (pageOptions === PageOptions.ALL) {
            imageData.push(page);
          }
          currentPage++;
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      imageData.push(buffer);
    }

    // if (this.debug) {
    //   console.log(`Sending ${imageData.length} images to LLM`)
    //   for await (const image of imageData) {
    //     console.log('  ~~~~ Image ~~~~ ')
    //     console.log(image.toString('base64'))
    //     console.log('  ~~~~ End Image ~~~~ ')
    //   }
    // }

    // clean up the response
    let content = "";

    if (this.model.startsWith("gpt-4")) {
      content = await useOpenAI({
        model: this.model as "gpt-4-turbo" | "gpt-4-vision-preview",
        imageData,
        prompt,
        debug: this.debug,
        apiKey: this.apiKey,
      });
    } else if (
      [
        "claude-3-opus-20240229",
        "claude-3-sonnet-20240229",
        "claude-3-haiku-20240307",
      ].includes(this.model)
    ) {
      if (mimeType === "application/pdf") {
        mimeType = "image/png";
      } else if (mimeType === "image/jpg") {
        mimeType = "image/jpeg";
      }
      content = await useAnthropic({
        imageData,
        prompt,
        debug: this.debug,
        apiKey: this.apiKey,
        mimeType,
        model: this.model as
          | "claude-3-opus-20240229"
          | "claude-3-sonnet-20240229"
          | "claude-3-haiku-20240307",
      });
    }

    if (this.debug) {
      console.log("Raw LLM Response: ");
      console.log(content);
    }

    content = content.replace("```json", "");
    content = content.replace("```", "");
    content = content.replace(/(?:\r\n|\r|\n)/g, "");
    content = content.replace(/(^,)|(,$)/g, "");

    const out = dJSON.parse(content ?? "{}");

    if (this.debug) {
      console.log("Cleaned LLM Response: ");
      console.log(JSON.stringify(out, null, 2));
      console.timeEnd("process");
    }

    return out;

    async function useOpenAI({
      imageData,
      prompt,
      debug,
      model,
      apiKey,
    }: {
      imageData: Array<Buffer>;
      prompt: string;
      debug: boolean;
      model: "gpt-4-turbo" | "gpt-4-vision-preview";
      apiKey: string;
    }) {
      // crop images and structure into LLM input format
      const imageGPTArray = await Promise.all(
        imageData.map(async (image) => {
          const message: OpenAI.Chat.Completions.ChatCompletionContentPart = {
            type: "image_url",
            image_url: {
              url: await cropImage(image),
            },
          };
          return message;
        })
      );

      if (debug) {
        console.log({
          prompt,
        });
      }

      const openai = new OpenAI({
        apiKey,
      });

      const response = await openai.chat.completions.create({
        model,
        response_format: {
          type: model === "gpt-4-vision-preview" ? "text" : "json_object",
        },
        max_tokens: 4096,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Find: " +
              prompt +
              "\nRespond with a valid JSON object with all numbers as a string an no additional text or characters.",
          },
          {
            role: "user",
            content: [...imageGPTArray],
          },
        ],
      });
      return response.choices[0].message.content ?? "";
    }

    async function useAnthropic({
      imageData,
      prompt,
      debug,
      model = "claude-3-haiku-20240307",
      apiKey,
      mimeType,
    }: {
      imageData: Array<Buffer>;
      prompt: string;
      debug: boolean;
      model?:
        | "claude-3-opus-20240229"
        | "claude-3-sonnet-20240229"
        | "claude-3-haiku-20240307";
      apiKey: string;
      mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    }) {
      // crop images and structure into LLM input format
      const imageGPTArray = await Promise.all(
        imageData.map(async (image) => {
          const message: Anthropic.ImageBlockParam = {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: (await cropImage(image)).split(",")[1],
            },
          };
          return message;
        })
      );

      if (debug) {
        console.log({
          prompt,
        });
      }

      const anthropic = new Anthropic({
        apiKey,
      });

      let extractedText = "";
      if (multiplePasses) {
        const ocr = await anthropic.messages.create({
          model: "claude-3-haiku-20240307",
          max_tokens: 4096,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all data including unlabeled fields",
                },
                ...imageGPTArray,
              ],
            },
          ],
        });

        if (debug) {
          console.log(ocr.content[0].text ?? "");
        }
        extractedText = ocr.content[0].text ?? "";
      }

      const response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              ...imageGPTArray,
              {
                type: "text",
                text:
                  `${extractedText}
` +
                  "Find: " +
                  prompt +
                  "\nRespond with a valid JSON object with all numbers as a string an no additional text or characters and if not provided, return null.",
              },
            ],
          },
        ],
      });
      return response.content[0].text ?? "";
    }
  };
}
