import { spaceOutOperators } from '@/lib/mathSymbols';

/**
 * 输入美化：给运算符两侧补空格、统一注释格式。
 * 只影响显示，不影响计算结果（计算前会再做一次符号归一化）。
 */
export function formatSpacing(value: string, preserveTrailingSpace: boolean): string {
    return value.split('\n').map(line => {
        const commentIndex = line.indexOf('#');
        const formulaPart = commentIndex === -1 ? line : line.substring(0, commentIndex);
        const commentPart = commentIndex === -1 ? '' : line.substring(commentIndex);

        let formatted = spaceOutOperators(formulaPart);

        if (!preserveTrailingSpace) {
            formatted = formatted.trimEnd();
        }

        if (commentPart) {
            const normalizedComment = preserveTrailingSpace
                ? commentPart.replace(/^#\s*/, '# ')
                : commentPart.replace(/^#\s*/, '# ').trimEnd();
            formatted = formatted ? formatted + ' ' + normalizedComment : normalizedComment;
        }

        return formatted;
    }).join('\n');
}

/**
 * 计算“美化后文本”中的光标位置，使光标在自动加空格后仍停在用户原本的位置。
 */
export function getNewCursorPos(original: string, formatted: string, cursorPos: number): number {
    let origIdx = 0;
    let fmtIdx = 0;

    while (origIdx < cursorPos) {
        if (fmtIdx >= formatted.length) {
            origIdx++;
            continue;
        }

        if (original[origIdx] === formatted[fmtIdx]) {
            origIdx++;
            fmtIdx++;
        } else if (formatted[fmtIdx] === ' ') {
            fmtIdx++;
        } else if (original[origIdx] === ' ') {
            origIdx++;
        } else {
            origIdx++;
            fmtIdx++;
        }
    }

    return fmtIdx;
}
