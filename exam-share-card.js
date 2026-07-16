function fitText(context, text, maxWidth, startSize, minimum = 34) {
  let size = startSize;
  while (size > minimum) {
    context.font = `760 ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function drawFinalShareCard(context, canvas, result, definition, options) {
  const { width, height } = canvas;
  const scores = options.scores ?? {};
  const levelScores = [
    ["L1 / 初级", scores.junior ?? "--"],
    ["L2 / 中级", scores.intermediate ?? "--"],
    ["L3 / 高级", scores.advanced ?? result.score],
  ];

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07162b");
  gradient.addColorStop(1, "#020713");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(146,164,184,.12)";
  context.lineWidth = 2;
  for (let x = 62; x < width; x += 118) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
  }
  for (let y = 64; y < height; y += 118) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }

  context.fillStyle = definition.accent;
  context.fillRect(0, 0, 22, height);
  context.fillStyle = "#ff5a1f";
  context.fillRect(22, 0, 7, 280);

  context.fillStyle = "#7394ff";
  context.font = "22px SFMono-Regular, Consolas, monospace";
  context.fillText("FDE FIELD TEST / THREE-LEVEL CHALLENGE", 80, 90);
  context.fillStyle = "#92a4b8";
  context.font = "18px SFMono-Regular, Consolas, monospace";
  context.fillText("200 QUESTIONS · SEQUENTIAL PROGRESSION", 80, 130);

  context.fillStyle = "#f4f7fb";
  context.font = "760 72px \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
  context.fillText("三级挑战完成", 78, 258);

  context.fillStyle = "#92a4b8";
  context.font = "18px SFMono-Regular, Consolas, monospace";
  context.fillText("CHALLENGER", 82, 350);
  context.fillStyle = "#f4f7fb";
  const nameSize = fitText(context, options.name, 900, 86, 42);
  context.font = `760 ${nameSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  context.fillText(options.name, 78, 438);

  context.fillStyle = "rgba(146,164,184,.18)";
  context.fillRect(80, 510, 920, 1);
  context.fillStyle = "#92a4b8";
  context.font = "18px SFMono-Regular, Consolas, monospace";
  context.fillText("BEST SCORE BY LEVEL", 82, 566);

  levelScores.forEach(([label, value], index) => {
    const x = 82 + index * 310;
    context.fillStyle = index === 2 ? definition.accent : "#7394ff";
    context.fillRect(x, 620, 264, 5);
    context.fillStyle = "#dbe5f1";
    context.font = "600 22px \"PingFang SC\", sans-serif";
    context.fillText(label, x, 680);
    context.fillStyle = "#f4f7fb";
    context.font = "760 112px SFMono-Regular, Consolas, monospace";
    context.fillText(String(value).padStart(2, "0"), x - 4, 806);
    context.fillStyle = "#92a4b8";
    context.font = "18px SFMono-Regular, Consolas, monospace";
    context.fillText("/ 100", x + 158, 795);
  });

  context.fillStyle = "rgba(41,98,255,.14)";
  context.fillRect(80, 880, 920, 178);
  context.strokeStyle = "rgba(115,148,255,.48)";
  context.strokeRect(80, 880, 920, 178);
  context.fillStyle = "#7394ff";
  context.font = "18px SFMono-Regular, Consolas, monospace";
  context.fillText("PROGRESSION STANDARD", 112, 928);
  context.fillStyle = "#f4f7fb";
  context.font = "700 27px \"PingFang SC\", sans-serif";
  context.fillText("完整挑战 ≥ 85 · 每模块 ≥ 70 · 不可跳级", 112, 987);
  context.fillStyle = "#aebdce";
  context.font = "17px \"PingFang SC\", sans-serif";
  context.fillText("从初级到高级，已完成全部 200 道传播型能力挑战。", 112, 1028);

  context.fillStyle = "rgba(255,90,31,.85)";
  context.fillRect(80, 1138, 44, 5);
  context.fillStyle = "#dbe5f1";
  context.font = "700 20px \"PingFang SC\", sans-serif";
  context.fillText("基于 OneX FDE 考核培训体系", 80, 1184);
  context.fillStyle = "#92a4b8";
  context.font = "17px \"PingFang SC\", sans-serif";
  context.fillText("本结果来自传播型 FDE 能力挑战，", 80, 1244);
  context.fillText("不代表正式毕业、认证或真实项目能力结论。", 80, 1280);
  context.fillStyle = "#7394ff";
  context.font = "17px SFMono-Regular, Consolas, monospace";
  context.fillText("版权所有 © 2026 OneX AI 社区", 80, 1354);
  context.textAlign = "right";
  context.fillStyle = "#92a4b8";
  context.fillText("fde.onex.plus", 1000, 1354);
  context.textAlign = "left";
}

export function drawExamShareCard(canvas, result, definition, options = {}) {
  const context = canvas.getContext("2d");
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);

  if (options.final === true) {
    drawFinalShareCard(context, canvas, result, definition, options);
    return;
  }

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07162b");
  gradient.addColorStop(1, "#020713");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(146,164,184,.13)";
  context.lineWidth = 2;
  for (let x = 70; x < width; x += 120) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
  }
  for (let y = 70; y < height; y += 120) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }

  context.fillStyle = definition.accent;
  context.fillRect(0, 0, 20, height);
  context.fillStyle = "#ff5a1f";
  context.fillRect(20, 0, 7, 230);

  context.fillStyle = "#7394ff";
  context.font = "22px SFMono-Regular, Consolas, monospace";
  context.fillText("FDE FIELD TEST / LEVEL ASSESSMENT", 82, 88);
  context.fillStyle = "#92a4b8";
  context.font = "18px SFMono-Regular, Consolas, monospace";
  context.fillText(`${definition.code} · ${result.mode === "full" ? "FULL CHALLENGE" : "RANDOM MOCK"}`, 82, 127);

  context.textAlign = "right";
  context.fillStyle = definition.accent;
  context.font = "700 112px SFMono-Regular, Consolas, monospace";
  context.fillText(`L${definition.id === "junior" ? 1 : definition.id === "intermediate" ? 2 : 3}`, 994, 160);
  context.textAlign = "left";

  context.fillStyle = "#f4f7fb";
  const titleSize = fitText(context, definition.title, 850, 82);
  context.font = `760 ${titleSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  context.fillText(definition.title, 78, 300);

  context.fillStyle = "#92a4b8";
  context.font = "18px SFMono-Regular, Consolas, monospace";
  context.fillText("ASSESSMENT SCORE", 82, 392);
  context.fillStyle = "#f4f7fb";
  context.font = "760 250px SFMono-Regular, Consolas, monospace";
  context.fillText(String(result.score).padStart(2, "0"), 62, 650);
  context.fillStyle = definition.accent;
  context.font = "22px SFMono-Regular, Consolas, monospace";
  context.fillText(`/ 100  ${definition.resultNoun}${result.classification.label}`, 525, 614);

  context.fillStyle = "rgba(146,164,184,.18)";
  context.fillRect(80, 750, 920, 1);
  context.fillStyle = "#92a4b8";
  context.font = "18px SFMono-Regular, Consolas, monospace";
  context.fillText("MODULE PROFILE", 82, 805);

  definition.modules.forEach((module, index) => {
    const value = result.moduleScores[module.id] ?? 0;
    const y = 862 + index * 72;
    context.fillStyle = "#dbe5f1";
    context.font = "600 19px \"PingFang SC\", sans-serif";
    context.fillText(module.short, 82, y);
    context.fillStyle = "rgba(146,164,184,.2)";
    context.fillRect(280, y - 18, 600, 14);
    context.fillStyle = definition.accent;
    context.fillRect(280, y - 18, 600 * value / 100, 14);
    context.fillStyle = "#f4f7fb";
    context.font = "700 18px SFMono-Regular, Consolas, monospace";
    context.fillText(String(value).padStart(3, " "), 912, y);
  });

  context.fillStyle = "rgba(255,90,31,.85)";
  context.fillRect(80, 1280, 44, 5);
  context.fillStyle = "#dbe5f1";
  context.font = "700 20px \"PingFang SC\", sans-serif";
  context.fillText("基于 OneX FDE 考核培训体系", 80, 1326);
  context.fillStyle = "#92a4b8";
  context.font = "17px \"PingFang SC\", sans-serif";
  context.fillText("版权所有 © 2026 OneX AI 社区", 80, 1361);
  context.textAlign = "right";
  context.fillText("线上测评结果不等于完整 FDE 能力认证", 1000, 1361);
  context.textAlign = "left";
}
