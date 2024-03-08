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
  openai: OpenAI;
  debug: boolean;

  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    model = "gpt-4-vision-preview",
    standardFontDataUrl = "https://unpkg.com/pdfjs-dist@3.2.146/standard_fonts/",
    debug = false,
  }: {
    apiKey?: string;
    model?: "gpt-4-vision-preview";
    standardFontDataUrl?: string;
    debug?: boolean;
  }) {
    if (!apiKey) {
      throw new Error("OCR API Key is not defined");
    }
    this.apiKey = apiKey;
    this.model = model;
    this.standardFontDataUrl = standardFontDataUrl;
    this.openai = new OpenAI({
      apiKey,
    });
    this.debug = debug;
  }

  process = async ({
    document,
    mimeType,
    prompt,
    pageOptions = PageOptions.ALL,
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
  }) => {
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

    if (this.debug) {
      console.log(`Sending ${imageData.length} images to LLM`);
      for await (const image of imageData) {
        console.log("  ~~~~ Image ~~~~ ");
        console.log(image.toString("base64"));
        console.log("  ~~~~ End Image ~~~~ ");
      }
    }

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

    if (this.debug) {
      console.log({
        prompt,
      });
    }

    const response = await this.openai.chat.completions.create({
      model: this.model,
      // response_format: {
      //   type: 'json_object',
      // },
      max_tokens: 4096,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "in the images supplied find " +
            prompt +
            "\nRespond with a valid JSON object with all numbers as a string an no additional text or characters.",
        },
        {
          role: "user",
          content: [...imageGPTArray],
        },
      ],
    });

    // clean up the response
    let content = response.choices[0].message.content ?? "";

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
    }

    return out;
  };
}
