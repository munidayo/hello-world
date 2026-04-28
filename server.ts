import "dotenv/config";
import express from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

type Civilization = "fire" | "nature" | "water" | "light" | "darkness" | "rainbow";

type GeneratedCard = {
  title: string;
  creatureType: string;
  cost: number;
  power: string;
  civilization: Civilization;
  rarity: string;
  abilityText: string;
  flavorText: string;
  artPrompt: string;
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
});

const app = express();
const openai = process.env.OPENAI_API_KEY ? new OpenAI() : null;
const isProduction = process.env.NODE_ENV === "production";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "1mb" }));

app.post("/api/generate-card", upload.single("image"), async (request, response) => {
  try {
    if (!openai) {
      response.status(400).json({
        error: "OPENAI_API_KEY が未設定です。.env にキーを設定するとAI生成を使えます。",
      });
      return;
    }

    if (!request.file) {
      response.status(400).json({ error: "画像ファイルが必要です。" });
      return;
    }

    const promptGuide =
      typeof request.body.promptGuide === "string" ? request.body.promptGuide.slice(0, 2_000) : "";
    const imageDataUrl = `data:${request.file.mimetype};base64,${request.file.buffer.toString("base64")}`;
    const textCompletion = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "あなたは日本語トレーディングカードの企画者です。既存の固有カード名や公式テキストをコピーせず、写真から派手で少年漫画的なカード設定を作ります。返答はJSONのみ。",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `この写真を読み取り、デュエマ風だが非公式のオリジナルカード設定を生成してください。title, creatureType, cost, power, civilization, rarity, abilityText, flavorText, artPrompt を含めてください。civilization は fire/nature/water/light/darkness/rainbow のどれか。abilityText は3行以内で、各行を■で始める。flavorTextは短く強い一文。artPrompt は画像生成向けに、全面イラスト・豪華な金属フチ・過剰な装飾・ホログラム・カードUI要素・日本語テキスト欄なしでも成立する見た目を英語で詳述してください。追加演出指示: ${promptGuide || "最近の派手な全面イラストカード風。フチ飾りを非常にうるさく、情報密度を高く。"}`,
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "generated_card",
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "title",
              "creatureType",
              "cost",
              "power",
              "civilization",
              "rarity",
              "abilityText",
              "flavorText",
              "artPrompt",
            ],
            properties: {
              title: { type: "string" },
              creatureType: { type: "string" },
              cost: { type: "integer", minimum: 0, maximum: 20 },
              power: { type: "string" },
              civilization: {
                type: "string",
                enum: ["fire", "nature", "water", "light", "darkness", "rainbow"],
              },
              rarity: { type: "string" },
              abilityText: { type: "string" },
              flavorText: { type: "string" },
              artPrompt: { type: "string" },
            },
          },
          strict: true,
        },
      },
    });

    const generatedCard = JSON.parse(textCompletion.output_text) as GeneratedCard;
    const cardImage = await openai.images.edit({
      model: "gpt-image-1",
      image: await toFile(request.file.buffer, request.file.originalname, {
        type: request.file.mimetype,
      }),
      prompt: buildImagePrompt(generatedCard, promptGuide),
      size: "1024x1536",
    });

    response.json({
      card: generatedCard,
      generatedImage: `data:image/png;base64,${cardImage.data?.[0]?.b64_json ?? ""}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI生成に失敗しました。";
    response.status(500).json({ error: message });
  }
});

if (isProduction) {
  const distPath = path.join(__dirname, "dist");
  app.use(express.static(distPath));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(distPath, "index.html"));
  });
} else {
  const vite = await createViteServer({
    appType: "spa",
    server: {
      middlewareMode: true,
    },
  });

  app.use(vite.middlewares);
}

const port = Number(process.env.PORT ?? 5173);
app.listen(port, "0.0.0.0", () => {
  console.log(`Duel Card Studio ready at http://localhost:${port}`);
});

function buildImagePrompt(card: GeneratedCard, promptGuide: string) {
  return [
    "Transform the uploaded photo into an original Japanese fantasy trading card image.",
    "Do not copy an official card layout exactly, but evoke a premium modern monster card: full-art composition, dense ornate border, layered metallic trim, civilization color gems, holographic foil, foil scratches, embossed panels, dramatic lighting, cinematic monster focus.",
    "Make the border much more elaborate than a simple frame: claws, vines, glyphs, rivets, beveled chrome, small icons, asymmetric ornamental corners, glowing energy veins.",
    "Recent full-art style: the creature art should bleed behind and around the UI, with only translucent rules text panels and compact stat badges.",
    `Card name: ${card.title}.`,
    `Creature type: ${card.creatureType}.`,
    `Civilization mood: ${card.civilization}. Cost ${card.cost}, power ${card.power}, rarity ${card.rarity}.`,
    `Flavor: ${card.flavorText}.`,
    promptGuide ? `Additional user style guide: ${promptGuide}.` : "",
    card.artPrompt,
    "Use readable Japanese title if possible, but prioritize card art quality and ornate design.",
  ].join(" ");
}
