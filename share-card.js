import { dimensionMeta } from "./question-data.js";

function polygonPoint(cx, cy, radius, index, count) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
}

function fitText(context, text, maxWidth, startSize, weight = 700) {
  let size = startSize;
  while (size > 30) {
    context.font = `${weight} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

export function drawShareCard(canvas, result) {
  const context = canvas.getContext("2d");
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07162b");
  gradient.addColorStop(1, "#030b17");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(146,164,184,.16)";
  context.lineWidth = 2;
  for (let x = 60; x < width; x += 120) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
  }
  for (let y = 60; y < height; y += 120) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }

  context.fillStyle = "#2962ff";
  context.fillRect(0, 0, 18, height);
  context.fillStyle = "#ff5a1f";
  context.fillRect(18, 0, 7, 210);

  context.fillStyle = "#7394ff";
  context.font = "24px SFMono-Regular, Consolas, monospace";
  context.fillText("FDE FIELD TEST / QUICK CALIBRATION", 80, 92);
  context.fillStyle = "#92a4b8";
  context.font = "18px SFMono-Regular, Consolas, monospace";
  context.fillText("潜质判断 · 尚未验证", 80, 132);

  context.save();
  context.translate(840, 150);
  context.strokeStyle = "#2962ff";
  context.lineWidth = 14;
  context.beginPath(); context.arc(0, 0, 76, -.3, Math.PI * 1.18); context.stroke();
  context.strokeStyle = "#0c2a4d";
  context.beginPath(); context.arc(0, 0, 76, Math.PI * 1.18, Math.PI * 1.7); context.stroke();
  context.fillStyle = "#ff5a1f";
  context.fillRect(-4, -94, 8, 24);
  context.fillStyle = "#f4f7fb";
  context.font = "700 38px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("FDE", 0, 0);
  context.restore();

  context.fillStyle = "#92a4b8";
  context.font = "20px SFMono-Regular, Consolas, monospace";
  context.fillText("MY FDE LEVEL", 80, 270);
  const titleSize = fitText(context, result.level.label, 850, 112);
  context.fillStyle = "#f4f7fb";
  context.font = `780 ${titleSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  context.fillText(result.level.label, 76, 380);

  context.fillStyle = "#f4f7fb";
  context.font = "700 236px SFMono-Regular, Consolas, monospace";
  context.fillText(String(result.index).padStart(2, "0"), 64, 638);
  context.fillStyle = "#7394ff";
  context.font = "24px SFMono-Regular, Consolas, monospace";
  context.fillText("/ 100  FDE POTENTIAL INDEX", 480, 610);

  const centerX = 540;
  const centerY = 940;
  const maxRadius = 255;
  const values = Object.values(result.dimensions);
  const labels = Object.keys(result.dimensions).map((key) => dimensionMeta[key].short);
  context.strokeStyle = "rgba(146,164,184,.22)";
  context.lineWidth = 2;
  for (let ring = 1; ring <= 4; ring += 1) {
    context.beginPath();
    labels.forEach((_, index) => {
      const [x, y] = polygonPoint(centerX, centerY, (maxRadius * ring) / 4, index, labels.length);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.closePath(); context.stroke();
  }
  context.beginPath();
  values.forEach((value, index) => {
    const [x, y] = polygonPoint(centerX, centerY, maxRadius * value / 100, index, values.length);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.closePath();
  context.fillStyle = "rgba(41,98,255,.3)";
  context.fill();
  context.strokeStyle = "#7394ff";
  context.lineWidth = 5;
  context.stroke();

  context.textAlign = "center";
  context.fillStyle = "#f4f7fb";
  context.font = "700 24px \"PingFang SC\", sans-serif";
  labels.forEach((label, index) => {
    const [x, y] = polygonPoint(centerX, centerY, maxRadius + 50, index, labels.length);
    context.fillText(`${label} ${values[index]}`, x, y + 8);
  });

  context.textAlign = "left";
  context.fillStyle = "#ff5a1f";
  context.fillRect(80, 1268, 46, 5);
  context.fillStyle = "#92a4b8";
  context.font = "18px \"PingFang SC\", sans-serif";
  context.fillText("会用 AI，不等于能做 FDE。", 80, 1308);
  context.fillStyle = "#f4f7fb";
  context.font = "700 18px \"PingFang SC\", sans-serif";
  context.fillText("基于 OneX FDE 考核培训体系", 80, 1350);
  context.fillStyle = "#92a4b8";
  context.font = "16px \"PingFang SC\", sans-serif";
  context.fillText("版权所有 © 2026 OneX AI 社区", 80, 1386);
}
