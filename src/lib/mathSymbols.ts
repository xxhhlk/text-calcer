/**
 * 把用户习惯输入的各种“标准数学符号”归一化成 mathjs 可识别的 ASCII 表达式。
 *
 * 覆盖范围：
 * - Unicode 运算符：× ÷ − ≤ ≥ ≠ 等
 * - 全角字符：０-９ Ａ-ｚ （） ＋ － ＝ ＾ ％ 等
 * - 特殊空白：全角空格 / 不间断空格
 * - 上标：2² -> 2^(2)
 * - 作为乘号使用的 x / X（只在运算符位置替换，避免误伤 exp / max 等函数名）
 * - 行尾多余的 '='，例如 "238 ÷ 365 × 189 ="
 */

/** 上标字符 -> 普通字符 */
const SUPERSCRIPT_MAP: Record<string, string> = {
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
    '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
    '⁺': '+', '⁻': '-',
};

const SUPERSCRIPT_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g;

/** 单个字符的替换表（全角字符由 toHalfWidth 统一处理） */
const SYMBOL_MAP: Record<string, string> = {
    // 乘号
    '×': '*', '✕': '*', '✖': '*', '⨯': '*', '⋅': '*', '·': '*', '∙': '*', '∗': '*',
    // 除号
    '÷': '/', '∕': '/', '⁄': '/',
    // 减号 / 连接号
    '−': '-', '–': '-', '—': '-', '―': '-',
    // 比较符
    '≤': '<=', '≥': '>=', '≠': '!=',
    // 空白
    '\u00a0': ' ', '\u2009': ' ', '\u202f': ' ', '\u3000': ' ',
    // 全角标点
    '，': ',', '：': ':', '；': ';',
};

/** 全角 ASCII（U+FF01 - U+FF5E）转半角 */
function toHalfWidth(ch: string): string {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0xff01 && code <= 0xff5e) {
        return String.fromCharCode(code - 0xfee0);
    }
    return ch;
}

/** 去掉行尾多余的 '='：'238 ÷ 365 × 189 =' -> '238 ÷ 365 × 189' */
export function stripDanglingEquals(line: string): string {
    return line.replace(/(?:\s*=)+\s*$/, '').trimEnd();
}

/**
 * 把作为乘号使用的 x / X 换成 '*'。
 * 只在运算符位置替换（前面是数字 / ) / % / ]，后面是数字或左括号），
 * 因此 exp(2)、max(2,3) 这类函数名不会被破坏。
 */
export function normalizeMultiplyX(line: string): string {
    return line.replace(/([\d)%\]])\s*[xX]\s*(?=[\d(])/g, '$1*');
}

/**
 * 自动加空格时识别的运算符：ASCII 写法 + Unicode / 全角写法（× ÷ − ＋ － ＊ ／ 等）。
 * 注意：全角字符在这里就要认出来，否则 "２３８÷３６５" 不会被打上空格。
 */
export const OPERATOR_CLASS = '[+\\-*/xX×✕✖⨯⋅·∙÷∕⁄−–—＋－＊／]';
/** 半角 + 全角数字 */
const DIGIT_CLASS = '[0-9０-９]';

export const OPERATOR_BEFORE_NUMBER_RE = new RegExp(`(${DIGIT_CLASS})\\s*(${OPERATOR_CLASS})\\s*(?=${DIGIT_CLASS})`, 'g');
export const OPERATOR_AT_LINE_END_RE = new RegExp(`(${DIGIT_CLASS})\\s*(${OPERATOR_CLASS})\\s*$`, 'g');
export const OPERATOR_AFTER_PAREN_RE = new RegExp(`([)）])\\s*(${OPERATOR_CLASS})\\s*`, 'g');

/** 给公式部分的运算符两侧补空格，便于阅读（不改变语义） */
export function spaceOutOperators(formulaPart: string): string {
    return formulaPart
        .replace(OPERATOR_BEFORE_NUMBER_RE, '$1 $2 ')
        .replace(OPERATOR_AT_LINE_END_RE, '$1 $2 ')
        .replace(OPERATOR_AFTER_PAREN_RE, '$1 $2 ');
}

/** 归一化一整行表达式（传入的应为已去掉注释的内容） */
export function normalizeMathSymbols(line: string): string {
    const withSuperscript = line.replace(SUPERSCRIPT_RE, (run) => {
        const inner = Array.from(run, (ch) => SUPERSCRIPT_MAP[ch] ?? '').join('');
        return `^(${inner})`;
    });

    let normalized = '';
    for (const ch of withSuperscript) {
        normalized += SYMBOL_MAP[ch] ?? toHalfWidth(ch);
    }

    return stripDanglingEquals(normalizeMultiplyX(normalized)).trim();
}
