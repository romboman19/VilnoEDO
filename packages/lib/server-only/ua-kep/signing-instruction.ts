import { Canvas } from 'skia-canvas';

import { ensureFontLibrary } from '../pdf/helpers';

type CanvasContext = ReturnType<Canvas['getContext']>;

const pageWidth = 595;
const pageHeight = 842;
const pageMargin = 58;
const textColor = '#111827';
const mutedTextColor = '#4b5563';
const accentColor = '#65a30d';
const fontFamily = 'Noto Sans';

const setFont = (context: CanvasContext, size: number, weight = '400') => {
  context.font = `${weight} ${size}px "${fontFamily}"`;
};

const wrapText = (context: CanvasContext, text: string, maxWidth: number) => {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return [''];
  }

  const words = normalized.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;

    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) {
      lines.push(line);
    }

    line = word;
  }

  if (line) {
    lines.push(line);
  }

  return lines;
};

const drawWrappedText = ({
  context,
  text,
  x,
  y,
  maxWidth,
  lineHeight,
}: {
  context: CanvasContext;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  lineHeight: number;
}) => {
  const lines = wrapText(context, text, maxWidth);

  for (const [index, line] of lines.entries()) {
    context.fillText(line, x, y + index * lineHeight);
  }

  return y + lines.length * lineHeight;
};

const drawHeading = (context: CanvasContext, text: string, y: number) => {
  setFont(context, 13, '700');
  context.fillStyle = textColor;
  context.fillText(text, pageMargin, y);

  context.strokeStyle = accentColor;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(pageMargin, y + 8);
  context.lineTo(pageWidth - pageMargin, y + 8);
  context.stroke();

  return y + 28;
};

const drawParagraph = (context: CanvasContext, text: string, y: number) => {
  setFont(context, 10);
  context.fillStyle = textColor;

  return (
    drawWrappedText({
      context,
      text,
      x: pageMargin,
      y,
      maxWidth: pageWidth - pageMargin * 2,
      lineHeight: 15,
    }) + 10
  );
};

const drawBullet = (context: CanvasContext, text: string, y: number) => {
  setFont(context, 10);
  context.fillStyle = textColor;
  context.fillText('•', pageMargin + 8, y);

  return (
    drawWrappedText({
      context,
      text,
      x: pageMargin + 26,
      y,
      maxWidth: pageWidth - pageMargin * 2 - 26,
      lineHeight: 15,
    }) + 6
  );
};

const drawStep = (context: CanvasContext, title: string, text: string, y: number) => {
  setFont(context, 10, '700');
  context.fillStyle = textColor;
  context.fillText(title, pageMargin, y);

  setFont(context, 10);

  return (
    drawWrappedText({
      context,
      text,
      x: pageMargin,
      y: y + 17,
      maxWidth: pageWidth - pageMargin * 2,
      lineHeight: 15,
    }) + 18
  );
};

export const generateUaKepSigningInstructionPdf = async () => {
  ensureFontLibrary();

  const canvas = new Canvas(pageWidth, pageHeight);
  canvas.gpu = false;

  const context = canvas.getContext('2d');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, pageWidth, pageHeight);

  let y = 74;

  setFont(context, 16, '700');
  context.fillStyle = textColor;
  y = drawWrappedText({
    context,
    text: 'Як виглядають збережені документи, підписані електронним підписом?',
    x: pageMargin,
    y,
    maxWidth: pageWidth - pageMargin * 2,
    lineHeight: 20,
  });
  y += 24;

  y = drawParagraph(
    context,
    'Документ із накладеним КЕП/УЕП зберігається архівом із декількох файлів. Архів VilnoEDO містить оригінал документа, файли підпису .p7s, PAdES PDF з вбудованим підписом, квитанцію про підписання та технічні дані для перевірки.',
    y,
  );

  y = drawBullet(context, 'original/ — оригінальні файли документів, які були підписані.', y);
  y = drawBullet(context, 'signatures/cades-detached/ — detached CAdES підписи у форматі .p7s.', y);
  y = drawBullet(
    context,
    'signatures/pades/ — PDF-документи з вбудованим PAdES підписом, якщо такий був сформований.',
    y,
  );
  y = drawBullet(
    context,
    'Квитанція про підписання.pdf — людський звіт із даними підписантів, сертифікатів і перевірки.',
    y,
  );

  y += 18;
  y = drawHeading(context, 'Як перевірити коректність підпису?', y);

  y = drawStep(context, 'Крок 1.', 'Завантажте архів із VilnoEDO та розпакуйте його на компʼютері.', y);

  y = drawStep(
    context,
    'Крок 2.',
    'Перейдіть на державний онлайн-сервіс перевірки КЕП/УЕП: https://czo.gov.ua/verify.',
    y,
  );

  y = drawStep(
    context,
    'Крок 3.',
    'У вікні перевірки оберіть оригінальний документ із папки original/ та відповідний файл підпису .p7s із папки signatures/cades-detached/.',
    y,
  );

  y = drawStep(
    context,
    'Крок 4.',
    'Натисніть кнопку перевірки. За потреби повторіть перевірку для кожного документа і кожного підпису з архіву.',
    y,
  );

  y = drawStep(
    context,
    'Крок 5.',
    'Звірте результат перевірки з квитанцією VilnoEDO: підписант, серійний номер сертифіката, час підписання та статус сертифіката мають відповідати даним у звіті.',
    y,
  );

  setFont(context, 8);
  context.fillStyle = mutedTextColor;
  context.fillText('VilnoEDO · Інструкція з перевірки КЕП/УЕП', pageMargin, pageHeight - 28);

  const buffer = await canvas.toBuffer('pdf');

  return new Uint8Array(buffer);
};
