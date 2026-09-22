import { evaluate, format, MathType } from 'mathjs';
import { Configs } from '@/conf';
import { normalizeMathSymbols, stripDanglingEquals } from '@/lib/mathSymbols';
import type { Locale, Messages } from '@/i18n/types';

/** 逐行计算结果，返回与输入行号一一对应的结果数组 */
export const calculateResults = (
    value: string,
    messages: Messages,
    locale: Locale,
    decimalPlaces: number,
): string[] => {
    if (value === '') {
        return [];
    }

    const inputLines = value.split('\n');
    const resultLines: string[] = [];
    for (const line of inputLines) {
        if (line.trim() === '') {
            resultLines.push('');
            continue;
        }
        const { lineWithoutComment, comment } = HandleOneLine(line);
        if (lineWithoutComment === '') {
            // 如果只有注释，保留注释内容以保持行号对应
            resultLines.push(comment ? `# ${comment}` : '');
            continue;
        }
        if (/^\d+(\.\d+)?$/.test(lineWithoutComment)) {
            // 如果是纯数字，直接推入
            resultLines.push(lineWithoutComment);
            continue;
        }
        let result = GetLineNoCommentResult(lineWithoutComment, messages, locale, decimalPlaces);
        if (comment) {
            result += `    # ${comment}`;
        }
        resultLines.push(result);
    }
    return resultLines;
};

export function formatEvalResultNumber(
    evalResult: number,
    needPercent: boolean,
    locale: Locale,
    decimalPlaces: number,
): string {
    if (Number.isInteger(evalResult)) {
        return new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: false }).format(evalResult);
    }

    const res = new Intl.NumberFormat(locale, {
        maximumFractionDigits: decimalPlaces,
        useGrouping: false,
    }).format(evalResult);

    // 股票涨跌幅显示优化 假如比例值处在[70%, 130%]时显示具体的百分比 实际上A股日内涨跌幅是20%以内 30%能满足大部分情况
    if (Configs.ShowNumPercentDetail) {  // 通过配置开启或者关闭
        if (needPercent && evalResult < 1.3 && evalResult > 0.7) {
            const percentValue = new Intl.NumberFormat(locale, {
                maximumFractionDigits: decimalPlaces,
                useGrouping: false,
            }).format(evalResult * 100 - 100);
            const sign = evalResult > 1 ? '+' : '';
            return `${res} (${sign}${percentValue}%)`;
        }
    }
    return res;
}

export function formatEvalResult(
    evalResult: MathType,
    needPercent: boolean,
    locale: Locale,
    decimalPlaces: number,
): string {
    if (typeof evalResult === 'number') {
        return formatEvalResultNumber(evalResult, needPercent, locale, decimalPlaces);
    } else if (typeof evalResult === 'string') {
        return evalResult;
    } else if (typeof evalResult === 'boolean') {
        // 比较运算（>= <= != == 等）的结果
        return evalResult ? 'true' : 'false';
    } else if (evalResult && typeof evalResult === 'object' && 'type' in evalResult) {
        if (evalResult.type === 'Complex') {
            return format(evalResult, { notation: 'auto' });
        } else if (evalResult.type === 'BigNumber') {
            return format(evalResult, { notation: 'auto', precision: 14 });
        } else if (evalResult.type === 'Unit') {
            return format(evalResult);
        } else {
            return format(evalResult);
        }
    }
    return '';
}


/** 分解成注释和公式两部分 */
export function HandleOneLine(line: string) {
    const trimmedLine = line.trim();
    // 1. 尝试查找注释
    const commentMatch = trimmedLine.match(/#\s*(.+)/);  // 捕获 # 后面的任意字符
    let comment = '';
    if (commentMatch) {
        comment = commentMatch[1];  // commentMatch[1] 是第一个捕获组的内容
    }
    // 2. 移除注释部分，再进行计算.
    const lineWithoutComment = trimmedLine.replace(/#.*/, '').trim();
    return { lineWithoutComment, comment }; // 返回一个对象
}


export function GetLineNoCommentResult(
    inpLine: string,
    messages: Messages,
    locale: Locale,
    decimalPlaces: number,
) {
    let result = '';
    // 展示用文本：只去掉行尾多余的 '='，其余保留用户原始写法
    const displayLine = stripDanglingEquals(inpLine);
    // 计算用文本：把 × ÷ − 、全角字符、上标、乘号 x 等归一化成 mathjs 能识别的写法
    const lineForCalc = normalizeMathSymbols(inpLine);

    if (lineForCalc.includes('a') && lineForCalc.includes('=')) {
        try { // 尝试解方程
            result = solveEquation(lineForCalc, messages, locale, decimalPlaces);
            result = `${messages.calculations.equationPrefix}${result}`;
        } catch {
            //如果solveEquation内部出错, 也不影响下面逻辑执行
            result = `${displayLine}  # ${messages.calculations.equationSolveFailed}`;
        }
        return result;
    }

    try {
        const needPercent = lineForCalc.includes('/') ? true : false;
        const evalResult = evaluate(lineForCalc);
        const formattedResult = formatEvalResult(evalResult, needPercent, locale, decimalPlaces);
        result = `${displayLine} = ${formattedResult}`;
    } catch {
        result = `${displayLine}`; //如果发生异常 还是显示原始行
    }
    return result;
}


/** 输入一个一元一次方程 a 表示需要求解的变量 */
export function solveEquation(
    equation: string,
    messages: Messages,
    locale: Locale,
    decimalPlaces: number,
): string {
    // 将方程以"="拆分为左右两部分
    const parts = equation.split('=');
    if (parts.length !== 2) {
        throw new Error(messages.calculations.equationFormatError);
    }
    const [left, right] = parts;

    // 定义函数 f(a) = 左边表达式 - 右边表达式
    const f = (a: number): number => {
        // 使用 Function 构造器生成计算表达式的函数
        const leftFunc = new Function("a", "return " + left);
        const rightFunc = new Function("a", "return " + right);
        return leftFunc(a) - rightFunc(a);
    };

    // 计算 f(0) 和 f(1)
    const f0 = f(0);
    const f1 = f(1);
    const coeff = f1 - f0; // 线性函数 f(a) = f0 + coeff * a

    // 如果系数为0，则需要判断是否有无穷多解或无解
    if (coeff === 0) {
        if (f0 === 0) return messages.calculations.equationInfiniteSolutions;
        else return messages.calculations.equationNoSolution;
    }

    // 求解 f(a) = 0 => a = -f(0) / coeff
    const result = -f0 / coeff;
    return formatEvalResultNumber(result, false, locale, decimalPlaces);
}
