import OpenAI from "openai";
import { pdf as pdfToImg } from "pdf-to-img";
import { cropImage } from "./cropImage";
const dJSON = require("dirty-json");

export class DocumentOcr {
  apiKey: string;
  model: string;
  standardFontDataUrl: string;
  openai: OpenAI;

  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    model = "gpt-4-vision-preview",
    standardFontDataUrl = "https://unpkg.com/pdfjs-dist@3.5.141/standard_fonts/",
  }: {
    apiKey?: string;
    model?: "gpt-4-vision-preview";
    standardFontDataUrl?: string;
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
  }

  process = async ({
    document,
    mimeType,
    prompt,
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
  }) => {
    // remove the data:image/xxx;base64, prefix if it exists
    if (typeof document === "string" && document.indexOf(",") > 0) {
      document = document.split(",")[1];
    }

    const buffer = Buffer.isBuffer(document)
      ? document
      : Buffer.from(document, "base64");

    // Array of image data to send to LLM
    const imageData: Array<Buffer> = [];

    // convert pdf to images
    if (mimeType === "application/pdf") {
      try {
        const pdfPages = await pdfToImg(buffer, {
          scale: 2,
          docInitParams: {
            disableFontFace: true,
            standardFontDataUrl: this.standardFontDataUrl,
          },
        });
        for await (const page of pdfPages) {
          imageData.push(page);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      imageData.push(buffer);
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
            "in the images supplied find" +
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
    content = content.replace("```json", "");
    content = content.replace("```", "");
    content = content.replace(/(?:\r\n|\r|\n)/g, "");
    content = content.replace(/(^,)|(,$)/g, "");
    return dJSON.parse(content ?? "{}");
  };
}
