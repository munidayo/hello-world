import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";

type Civilization = "fire" | "nature" | "water" | "light" | "darkness" | "rainbow";

type CardState = {
  title: string;
  creatureType: string;
  cost: number;
  power: string;
  civilization: Civilization;
  rarity: string;
  abilityText: string;
  flavorText: string;
  imageFit: "cover" | "contain";
  foil: boolean;
};

type GenerateResponse = {
  card: Omit<CardState, "imageFit" | "foil"> & {
    artPrompt: string;
  };
  generatedImage: string;
};

const CARD_WIDTH = 744;
const CARD_HEIGHT = 1040;

const DEFAULT_STYLE_PROMPT =
  "全面イラスト寄り。近年の豪華カード風に、枠飾りは過剰な金属装飾、宝石、文明アイコン、ホログラム線、立体的な角飾りを多層にする。説明欄は半透明で、イラストが背景まで回り込む。公式カードの完全コピーではなく、非公式のオリジナルTCGカードとして高密度に。";

const CIVILIZATIONS: Record<
  Civilization,
  {
    label: string;
    colors: [string, string, string];
    text: string;
  }
> = {
  fire: {
    label: "火文明",
    colors: ["#f97316", "#dc2626", "#7f1d1d"],
    text: "#fff7ed",
  },
  nature: {
    label: "自然文明",
    colors: ["#84cc16", "#16a34a", "#14532d"],
    text: "#f7fee7",
  },
  water: {
    label: "水文明",
    colors: ["#38bdf8", "#2563eb", "#1e3a8a"],
    text: "#eff6ff",
  },
  light: {
    label: "光文明",
    colors: ["#fde68a", "#facc15", "#92400e"],
    text: "#451a03",
  },
  darkness: {
    label: "闇文明",
    colors: ["#a855f7", "#581c87", "#111827"],
    text: "#faf5ff",
  },
  rainbow: {
    label: "多色",
    colors: ["#ef4444", "#22c55e", "#3b82f6"],
    text: "#ffffff",
  },
};

const initialCard: CardState = {
  title: "超写真竜 スナップ・カイザー",
  creatureType: "フォト・コマンド・ドラゴン",
  cost: 7,
  power: "9000",
  civilization: "rainbow",
  rarity: "SR",
  abilityText:
    "■ W・ブレイカー\n■ このクリーチャーが出た時、自分の写真を1枚選び、カードの世界に封じ込める。\n■ その写真が最高に盛れていたなら、相手のクリーチャーを1体選び、持ち主の手札に戻す。",
  flavorText: "一枚の思い出が、世界を変える切り札になる。",
  imageFit: "cover",
  foil: true,
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const imageFileRef = useRef<File | null>(null);
  const [card, setCard] = useState<CardState>(initialCard);
  const [imageName, setImageName] = useState("サンプル背景");
  const [stylePrompt, setStylePrompt] = useState(DEFAULT_STYLE_PROMPT);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const activeCivilization = CIVILIZATIONS[card.civilization];
  const downloadName = useMemo(
    () => `${card.title.trim().replace(/[\\/:*?"<>|]+/g, "-") || "duel-card"}.png`,
    [card.title],
  );

  useEffect(() => {
    drawCard(canvasRef.current, imageRef.current, card);
  }, [card]);

  const updateCard = <K extends keyof CardState>(key: K, value: CardState[K]) => {
    setCard((current) => ({ ...current, [key]: value }));
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const nextImage = new Image();
    const objectUrl = URL.createObjectURL(file);

    nextImage.onload = () => {
      URL.revokeObjectURL(objectUrl);
      imageFileRef.current = file;
      imageRef.current = nextImage;
      setImageName(file.name);
      setGeneratedImage(null);
      drawCard(canvasRef.current, nextImage, card);
    };
    nextImage.src = objectUrl;
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const link = document.createElement("a");
    link.download = downloadName;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleGeneratedDownload = () => {
    if (!generatedImage) {
      return;
    }

    const link = document.createElement("a");
    link.download = `${downloadName.replace(/\.png$/i, "")}-ai.png`;
    link.href = generatedImage;
    link.click();
  };

  const handleAiGenerate = async () => {
    if (!imageFileRef.current) {
      setAiStatus("先に写真を選んでください。");
      return;
    }

    setIsGenerating(true);
    setAiStatus("写真を読み取り、カード設定と豪華カード画像を生成中...");

    try {
      const formData = new FormData();
      formData.append("image", imageFileRef.current);
      formData.append("promptGuide", stylePrompt);

      const response = await fetch("/api/generate-card", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as Partial<GenerateResponse> & { error?: string };

      if (!response.ok || payload.error || !payload.card) {
        throw new Error(payload.error ?? "AI生成に失敗しました。");
      }

      const generatedCard = payload.card;
      setCard((current) => ({
        ...current,
        title: generatedCard.title,
        creatureType: generatedCard.creatureType,
        cost: generatedCard.cost,
        power: generatedCard.power,
        civilization: generatedCard.civilization,
        rarity: generatedCard.rarity,
        abilityText: generatedCard.abilityText,
        flavorText: generatedCard.flavorText,
      }));
      setGeneratedImage(payload.generatedImage || null);
      setAiStatus("AI生成が完了しました。下の生成画像と編集可能なカード情報を確認できます。");
    } catch (error) {
      setAiStatus(error instanceof Error ? error.message : "AI生成に失敗しました。");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Duel Card Studio</p>
          <h1>どんな写真もデュエマ風カードに変換</h1>
          <p className="hero-copy">
            写真をアップロードして、名前・文明・コスト・能力を編集。カード枠やキラ風の演出を合成したPNGをその場で保存できます。
          </p>
        </div>
        <button className="primary-action" type="button" onClick={handleDownload}>
          PNGで保存
        </button>
      </section>

      <section className="workspace">
        <form className="control-panel">
          <label className="upload-card">
            <span>写真を選ぶ</span>
            <strong>{imageName}</strong>
            <input accept="image/*" type="file" onChange={handleImageChange} />
          </label>

          <section className="ai-card" aria-label="AI生成">
            <div>
              <span>AIでまるごとカード化</span>
              <p>
                写真からカード名・文明・能力・フレーバーを生成し、より豪華な全面イラスト風カード画像も作ります。
              </p>
            </div>
            <label>
              追加演出プロンプト
              <textarea
                rows={5}
                value={stylePrompt}
                onChange={(event) => setStylePrompt(event.target.value)}
              />
            </label>
            <button className="secondary-action" disabled={isGenerating} type="button" onClick={handleAiGenerate}>
              {isGenerating ? "生成中..." : "AI生成する"}
            </button>
            {aiStatus ? <p className="ai-status">{aiStatus}</p> : null}
          </section>

          <div className="field-grid">
            <label>
              カード名
              <input
                value={card.title}
                onChange={(event) => updateCard("title", event.target.value)}
              />
            </label>

            <label>
              種族
              <input
                value={card.creatureType}
                onChange={(event) => updateCard("creatureType", event.target.value)}
              />
            </label>

            <label>
              コスト
              <input
                max={99}
                min={0}
                type="number"
                value={card.cost}
                onChange={(event) => updateCard("cost", Number(event.target.value))}
              />
            </label>

            <label>
              パワー
              <input
                value={card.power}
                onChange={(event) => updateCard("power", event.target.value)}
              />
            </label>

            <label>
              レアリティ
              <input
                value={card.rarity}
                onChange={(event) => updateCard("rarity", event.target.value.toUpperCase())}
              />
            </label>

            <label>
              文明
              <select
                value={card.civilization}
                onChange={(event) => updateCard("civilization", event.target.value as Civilization)}
              >
                {Object.entries(CIVILIZATIONS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            能力テキスト
            <textarea
              rows={7}
              value={card.abilityText}
              onChange={(event) => updateCard("abilityText", event.target.value)}
            />
          </label>

          <label>
            フレーバーテキスト
            <textarea
              rows={3}
              value={card.flavorText}
              onChange={(event) => updateCard("flavorText", event.target.value)}
            />
          </label>

          <div className="toggle-row">
            <label>
              <input
                checked={card.foil}
                type="checkbox"
                onChange={(event) => updateCard("foil", event.target.checked)}
              />
              キラ風エフェクト
            </label>

            <label>
              写真の合わせ方
              <select
                value={card.imageFit}
                onChange={(event) => updateCard("imageFit", event.target.value as CardState["imageFit"])}
              >
                <option value="cover">全面に敷き詰める</option>
                <option value="contain">全体を収める</option>
              </select>
            </label>
          </div>
        </form>

        <div className="preview-column">
          {generatedImage ? (
            <section className="generated-preview">
              <div className="preview-heading">
                <div>
                  <span>AI生成カード</span>
                  <p>画像生成で作った豪華版です。文字の正確さは下のCanvas版で補完できます。</p>
                </div>
                <button className="secondary-action compact" type="button" onClick={handleGeneratedDownload}>
                  AI画像を保存
                </button>
              </div>
              <img alt="AIで生成したカード" src={generatedImage} />
            </section>
          ) : null}

          <section
            className="preview-wrap"
            style={{ "--accent": activeCivilization.colors[0] } as CSSProperties}
          >
            <canvas
              ref={canvasRef}
              aria-label="生成されたカードのプレビュー"
              height={CARD_HEIGHT}
              width={CARD_WIDTH}
            />
          </section>
        </div>
      </section>
    </main>
  );
}

function drawCard(canvas: HTMLCanvasElement | null, image: HTMLImageElement | null, card: CardState) {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const civ = CIVILIZATIONS[card.civilization];
  const [start, middle, end] = civ.colors;

  context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  drawRoundedCardBase(context, start, middle, end);
  drawArtWindow(context, image, card.imageFit);
  drawChrome(context, start, middle, end, card.foil);
  drawHeader(context, card, civ.text);
  drawTextBox(context, card);
  drawFooter(context, card, start);
}

function drawRoundedCardBase(
  context: CanvasRenderingContext2D,
  start: string,
  middle: string,
  end: string,
) {
  const gradient = context.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, start);
  gradient.addColorStop(0.52, middle);
  gradient.addColorStop(1, end);

  context.save();
  roundedRect(context, 14, 14, CARD_WIDTH - 28, CARD_HEIGHT - 28, 42);
  context.fillStyle = gradient;
  context.fill();
  context.lineWidth = 18;
  context.strokeStyle = "#150b08";
  context.stroke();

  const inner = context.createLinearGradient(55, 45, 690, 970);
  inner.addColorStop(0, "rgba(255,255,255,0.9)");
  inner.addColorStop(0.16, "rgba(255,255,255,0.08)");
  inner.addColorStop(0.62, "rgba(0,0,0,0.18)");
  inner.addColorStop(1, "rgba(255,255,255,0.38)");
  context.lineWidth = 8;
  context.strokeStyle = inner;
  roundedRect(context, 46, 46, CARD_WIDTH - 92, CARD_HEIGHT - 92, 30);
  context.stroke();
  context.restore();
}

function drawArtWindow(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  fit: CardState["imageFit"],
) {
  const frame = { x: 82, y: 138, width: 580, height: 488 };

  context.save();
  roundedRect(context, frame.x - 12, frame.y - 12, frame.width + 24, frame.height + 24, 26);
  context.fillStyle = "rgba(20, 10, 6, 0.74)";
  context.fill();

  roundedRect(context, frame.x, frame.y, frame.width, frame.height, 18);
  context.clip();

  if (image) {
    const drawSize = getObjectFitSize(image.width, image.height, frame.width, frame.height, fit);
    context.drawImage(image, frame.x + drawSize.x, frame.y + drawSize.y, drawSize.width, drawSize.height);
  } else {
    const gradient = context.createLinearGradient(frame.x, frame.y, frame.x + frame.width, frame.y + frame.height);
    gradient.addColorStop(0, "#1e1b4b");
    gradient.addColorStop(0.45, "#7c2d12");
    gradient.addColorStop(1, "#0f172a");
    context.fillStyle = gradient;
    context.fillRect(frame.x, frame.y, frame.width, frame.height);
    drawPlaceholderBurst(context, frame.x + frame.width / 2, frame.y + frame.height / 2);
  }

  const shade = context.createLinearGradient(frame.x, frame.y, frame.x, frame.y + frame.height);
  shade.addColorStop(0, "rgba(255,255,255,0.2)");
  shade.addColorStop(0.58, "rgba(255,255,255,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.34)");
  context.fillStyle = shade;
  context.fillRect(frame.x, frame.y, frame.width, frame.height);
  context.restore();
}

function drawPlaceholderBurst(context: CanvasRenderingContext2D, centerX: number, centerY: number) {
  context.save();
  for (let i = 0; i < 24; i += 1) {
    context.rotate(Math.PI / 12);
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(centerX + 340, centerY - 20);
    context.lineTo(centerX + 340, centerY + 20);
    context.closePath();
    context.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.16)" : "rgba(255,210,86,0.16)";
    context.fill();
  }
  context.restore();
}

function drawChrome(
  context: CanvasRenderingContext2D,
  start: string,
  middle: string,
  end: string,
  foil: boolean,
) {
  const sideGradient = context.createLinearGradient(70, 130, 675, 980);
  sideGradient.addColorStop(0, start);
  sideGradient.addColorStop(0.45, middle);
  sideGradient.addColorStop(1, end);

  context.save();
  context.globalAlpha = 0.92;
  context.fillStyle = sideGradient;
  context.beginPath();
  context.moveTo(62, 650);
  context.bezierCurveTo(98, 606, 130, 600, 172, 634);
  context.lineTo(572, 634);
  context.bezierCurveTo(620, 600, 660, 606, 682, 650);
  context.lineTo(662, 920);
  context.bezierCurveTo(530, 982, 218, 982, 82, 920);
  context.closePath();
  context.fill();

  if (foil) {
    for (let i = 0; i < 11; i += 1) {
      context.strokeStyle = `hsla(${i * 32}, 92%, 72%, 0.24)`;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(92 + i * 58, 80);
      context.lineTo(12 + i * 62, 1010);
      context.stroke();
    }
  }

  drawOrnateFrame(context, start, middle, end);
  context.restore();
}

function drawOrnateFrame(
  context: CanvasRenderingContext2D,
  start: string,
  middle: string,
  end: string,
) {
  const ornamentGradient = context.createLinearGradient(34, 34, 710, 1006);
  ornamentGradient.addColorStop(0, "rgba(255,255,255,0.88)");
  ornamentGradient.addColorStop(0.2, start);
  ornamentGradient.addColorStop(0.5, middle);
  ornamentGradient.addColorStop(0.8, end);
  ornamentGradient.addColorStop(1, "rgba(255,255,255,0.72)");

  context.save();
  context.strokeStyle = ornamentGradient;
  context.lineWidth = 7;
  roundedRect(context, 64, 54, CARD_WIDTH - 128, CARD_HEIGHT - 100, 34);
  context.stroke();

  context.lineWidth = 3;
  context.strokeStyle = "rgba(255,255,255,0.34)";
  roundedRect(context, 84, 78, CARD_WIDTH - 168, CARD_HEIGHT - 148, 24);
  context.stroke();

  for (let i = 0; i < 4; i += 1) {
    const left = i % 2 === 0;
    const top = i < 2;
    const x = left ? 74 : CARD_WIDTH - 74;
    const y = top ? 84 : CARD_HEIGHT - 84;
    drawCornerOrnament(context, x, y, left ? 1 : -1, top ? 1 : -1, ornamentGradient);
  }

  for (let i = 0; i < 9; i += 1) {
    const y = 170 + i * 82;
    drawSideGem(context, 49, y, start, i);
    drawSideGem(context, CARD_WIDTH - 49, y, end, i + 3);
  }
  context.restore();
}

function drawCornerOrnament(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scaleX: number,
  scaleY: number,
  stroke: CanvasGradient,
) {
  context.save();
  context.translate(x, y);
  context.scale(scaleX, scaleY);
  context.strokeStyle = stroke;
  context.fillStyle = "rgba(10, 8, 14, 0.62)";
  context.lineWidth = 5;

  context.beginPath();
  context.moveTo(0, 0);
  context.bezierCurveTo(42, 8, 62, 28, 68, 72);
  context.bezierCurveTo(38, 54, 26, 40, 0, 0);
  context.closePath();
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(16, 12);
  context.bezierCurveTo(54, 20, 90, 10, 116, -16);
  context.stroke();

  context.beginPath();
  context.moveTo(12, 18);
  context.bezierCurveTo(20, 58, 10, 96, -18, 118);
  context.stroke();
  context.restore();
}

function drawSideGem(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  index: number,
) {
  const radius = index % 3 === 0 ? 9 : 6;
  const gem = context.createRadialGradient(x - 3, y - 4, 2, x, y, radius + 5);
  gem.addColorStop(0, "#ffffff");
  gem.addColorStop(0.35, color);
  gem.addColorStop(1, "#08070a");

  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = gem;
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = "rgba(255,255,255,0.58)";
  context.stroke();
}

function drawHeader(context: CanvasRenderingContext2D, card: CardState, titleColor: string) {
  const civ = CIVILIZATIONS[card.civilization];
  const titleGradient = context.createLinearGradient(90, 66, 655, 120);
  titleGradient.addColorStop(0, "rgba(0,0,0,0.72)");
  titleGradient.addColorStop(0.5, "rgba(0,0,0,0.24)");
  titleGradient.addColorStop(1, "rgba(255,255,255,0.28)");

  context.save();
  roundedRect(context, 88, 64, 560, 64, 18);
  context.fillStyle = titleGradient;
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = "rgba(255,255,255,0.42)";
  context.stroke();

  context.font = "700 34px system-ui, sans-serif";
  context.fillStyle = titleColor;
  context.shadowColor = "rgba(0,0,0,0.85)";
  context.shadowBlur = 8;
  fitText(context, card.title, 112, 108, 430, 34);

  const orb = context.createRadialGradient(594, 88, 8, 594, 88, 48);
  orb.addColorStop(0, "#ffffff");
  orb.addColorStop(0.3, civ.colors[0]);
  orb.addColorStop(1, "#1f130d");
  context.shadowBlur = 0;
  context.beginPath();
  context.arc(594, 88, 45, 0, Math.PI * 2);
  context.fillStyle = orb;
  context.fill();
  context.lineWidth = 5;
  context.strokeStyle = "rgba(255,255,255,0.78)";
  context.stroke();
  context.font = "900 42px Georgia, serif";
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(card.cost), 594, 88);
  context.restore();
}

function drawTextBox(context: CanvasRenderingContext2D, card: CardState) {
  context.save();
  roundedRect(context, 82, 642, 580, 276, 18);
  context.fillStyle = "rgba(255, 248, 220, 0.78)";
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = "rgba(255,255,255,0.46)";
  context.stroke();
  context.lineWidth = 2;
  context.strokeStyle = "rgba(62, 31, 10, 0.72)";
  roundedRect(context, 92, 652, 560, 256, 12);
  context.stroke();

  context.font = "700 24px system-ui, sans-serif";
  context.fillStyle = "#3a1d0b";
  context.fillText(card.creatureType, 116, 686);

  context.font = "23px system-ui, sans-serif";
  context.fillStyle = "#1f2937";
  wrapText(context, card.abilityText, 116, 725, 512, 32, 5);

  context.font = "italic 21px Georgia, serif";
  context.fillStyle = "#6b3f18";
  wrapText(context, card.flavorText, 116, 878, 512, 27, 2);
  context.restore();
}

function drawFooter(context: CanvasRenderingContext2D, card: CardState, accent: string) {
  context.save();
  const powerGradient = context.createLinearGradient(392, 910, 656, 988);
  powerGradient.addColorStop(0, accent);
  powerGradient.addColorStop(1, "#111827");
  roundedRect(context, 388, 914, 266, 70, 14);
  context.fillStyle = powerGradient;
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = "rgba(255,255,255,0.62)";
  context.stroke();

  context.font = "900 34px Georgia, serif";
  context.fillStyle = "#ffffff";
  context.textAlign = "right";
  context.textBaseline = "middle";
  context.fillText(`P ${card.power}`, 632, 949);

  context.beginPath();
  context.arc(116, 946, 36, 0, Math.PI * 2);
  context.fillStyle = "#111827";
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = accent;
  context.stroke();
  context.font = "800 24px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillStyle = "#ffffff";
  context.fillText(card.rarity || "C", 116, 947);

  context.font = "16px system-ui, sans-serif";
  context.textAlign = "left";
  context.fillStyle = "rgba(255,255,255,0.82)";
  context.fillText("DM-STUDIO / FAN ART GENERATOR", 168, 956);
  context.restore();
}

function getObjectFitSize(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  fit: CardState["imageFit"],
) {
  const scale =
    fit === "cover"
      ? Math.max(frameWidth / imageWidth, frameHeight / imageHeight)
      : Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    x: (frameWidth - width) / 2,
    y: (frameHeight - height) / 2,
    width,
    height,
  };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  baseSize: number,
) {
  let fontSize = baseSize;

  do {
    context.font = `700 ${fontSize}px system-ui, sans-serif`;
    fontSize -= 1;
  } while (context.measureText(text).width > maxWidth && fontSize > 18);

  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText(text, x, y);
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const paragraphs = text.split("\n");
  let currentY = y;
  let drawnLines = 0;

  for (const paragraph of paragraphs) {
    const words = segmentText(paragraph);
    let line = "";

    for (const word of words) {
      const candidate = line ? `${line}${word}` : word;

      if (context.measureText(candidate).width > maxWidth && line) {
        context.fillText(line, x, currentY);
        currentY += lineHeight;
        drawnLines += 1;
        line = word.trimStart();

        if (drawnLines >= maxLines) {
          return;
        }
      } else {
        line = candidate;
      }
    }

    if (line && drawnLines < maxLines) {
      context.fillText(line, x, currentY);
      currentY += lineHeight;
      drawnLines += 1;
    }

    if (drawnLines >= maxLines) {
      return;
    }
  }
}

function segmentText(text: string) {
  if (text.includes(" ")) {
    return text.split(/(\s+)/);
  }

  return Array.from(text);
}

export default App;
