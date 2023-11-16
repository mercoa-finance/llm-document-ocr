<h1 align="center"> <code>llm-document-ocr</code> </h1>

<div align="center">

[![npm version](https://img.shields.io/npm/v/llm-document-ocr.svg)](https://npmjs.org/package/llm-document-ocr "View this project on NPM")
[![npm downloads](https://img.shields.io/npm/dm/llm-document-ocr)](https://www.npmjs.com/package/llm-document-ocr)
[![license](https://img.shields.io/npm/l/llm-document-ocr)](LICENSE.md)

</div>

---

Sponsored by [Mercoa](https://mercoa.com), the API for BillPay and Invoicing. Everything you need to launch accounts payable in your product with a single API!

---

LLM Based OCR and Document Parsing for Node.js. Uses GPT4-V for OCR and data extraction.

- Converts PDFs (including multi page PDFs) into PNGs for use with GPT4-V
- Automatically crops white-space to create smaller inputs
- Cleans up JSON string returned by GPT4-V and converts it to an JSON object
- Custom prompt support for capturing any data you need

Supports:

- ✅ PNG
- ✅ WEBP
- ✅ JPEG / JPG
- ✅ GIF
- ✅ PDF
- ✅ Multi-page PDF
- ❌ DOC
- ❌ DOCX

## Usage

```ts
import { DocumentOcr, prompts } from "llm-document-ocr";

const documentOcr = new DocumentOcr({
  apiKey: 'YOUR-OPENAI-API-KEY' // required, defaults to process.env.OPENAI_API_KEY
  model: "gpt-4-vision-preview", // optional, defaults to "gpt-4-vision-preview"
  standardFontDataUrl: "https://unpkg.com/pdfjs-dist@3.5.141/standard_fonts/" // optional, defaults to "https://unpkg.com/pdfjs-dist@3.5.141/standard_fonts/". You can use the systems fonts or the fonts under ./node_modules/pdfjs-dist/standard_fonts/ as well.
});

const documentData = await documentOcr.process({
  document: 'JVBERi0xLjMNCiXi48/TDQoNCjEgMCBvYmoNCjw8DQ...', // Base64 String, Base64 URI, or Buffer
  mimeType: 'application/pdf', // mime-type of the document or image
  prompt: 'invoiceStartDate, invoiceEndDate, amount', // system prompt for data extraction. See examples below.
})
```

## Prompts

Prompts will be automatically prefixed to tell GPT4-V to return JSON. You will need to specify the data you wish to extract, and GPT will return a JSON object with those keys.

For example, the prompt we use at Mercoa for invoice processing is the following:

```js
`invoice number, invoice amount, currency (as ISO 4217 code), dueDate, invoiceDate, serviceStartDate, serviceEndDate,
  vendor's [name, email with @, website],
  line items [amnt, price, qty, des, name, cur (as ISO 4217 code)]`;
```

And this returns a JSON object that looks like:

```ts
{
  invoiceNumber?: string | number
  invoiceAmount?: string | number
  currency?: string
  dueDate?: string
  invoiceDate?: string
  serviceStartDate?: string
  serviceEndDate?: string
  vendor: {
    name?: string
    email?: string
    website?: string
  }
  lineItems: Array<{
    des?: string
    qty?: string | number
    price?: string | number
    amnt?: string | number
    name?: string
    cur?: string
  }>
}
```

## Limitations

Currently, GPT4-V has a limitation of 100 requests per day.

## Issues and Contributing

If you encounter a bug or want to see something added/changed, please go ahead
and
[open an issue](https://github.com/mercoa-finance/llm-document-ocr/issues/new)

If you wish to contribute to the library, thanks! Please see the [CONTRIBUTING](https://github.com/mercoa-finance/llm-document-ocr/blob/main/CONTRIBUTING.md) guide for more details.

## License

MIT © [Mercoa, Inc](https://mercoa.com/)
