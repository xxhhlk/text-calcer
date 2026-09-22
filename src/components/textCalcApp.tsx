import { Textarea } from "@/components/ui/textarea";
import { useState, useRef, ChangeEvent, ClipboardEvent } from 'react';
import { Configs } from '@/conf';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { calculateResults } from '@/lib/calcCore';
import { formatSpacing, getNewCursorPos } from '@/lib/textFormat';

export function TextCalcApp() {
    const [lines, setLines] = useState<{ input: string; result: string[] }>(() => {
        const savedInput = localStorage.getItem('calcInput') || '';
        return {
            input: savedInput,
            result: savedInput ? calculateResults(savedInput) : []
        };
    });
    const [copiedLineIndex, setCopiedLineIndex] = useState<number | null>(null);
    const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const prevValueRef = useRef<string>(lines.input);
    const isFormattingRef = useRef(false);
    const trimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cleanupTrailingSpaces = (value: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        
        const trimmed = formatSpacing(value, false);
        if (trimmed !== value) {
            const cursorPos = textarea.selectionStart ?? 0;
            const newCursorPos = getNewCursorPos(value, trimmed, cursorPos);
            
            textarea.focus();
            document.execCommand('selectAll', false);
            document.execCommand('insertText', false, trimmed);
            
            isFormattingRef.current = true;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
            
            const resArray = calculateResults(trimmed);
            setLines({ input: trimmed, result: resArray });
            localStorage.setItem('calcInput', trimmed);
            prevValueRef.current = trimmed;
        }
    };

    const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        
        if (trimTimerRef.current) {
            clearTimeout(trimTimerRef.current);
            trimTimerRef.current = null;
        }
        
        const value = e.target.value;
        
        if (isFormattingRef.current) {
            isFormattingRef.current = false;
            const resArray = calculateResults(value);
            setLines({ input: value, result: resArray });
            localStorage.setItem('calcInput', value);
            prevValueRef.current = value;
            return;
        }
        
        const isDelete = value.length < prevValueRef.current.length;
        
        if (!isDelete) {
            const formatted = formatSpacing(value, true);
            if (formatted !== value) {
                const cursorPos = textarea.selectionStart ?? 0;
                const newCursorPos = getNewCursorPos(value, formatted, cursorPos);
                
                textarea.focus();
                document.execCommand('selectAll', false);
                document.execCommand('insertText', false, formatted);
                
                isFormattingRef.current = true;
                textarea.setSelectionRange(newCursorPos, newCursorPos);
                
                const resArray = calculateResults(formatted);
                setLines({ input: formatted, result: resArray });
                localStorage.setItem('calcInput', formatted);
                prevValueRef.current = formatted;
                
                trimTimerRef.current = setTimeout(() => {
                    const current = textareaRef.current?.value ?? '';
                    cleanupTrailingSpaces(current);
                }, 5000);
                return;
            }
        }
        
        const resArray = calculateResults(value);
        setLines({ input: value, result: resArray });
        localStorage.setItem('calcInput', value);
        prevValueRef.current = value;
        
        trimTimerRef.current = setTimeout(() => {
            const current = textareaRef.current?.value ?? '';
            cleanupTrailingSpaces(current);
        }, 5000);
    };

    const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        
        e.preventDefault();
        const text = e.clipboardData.getData('text');
        const formatted = formatSpacing(text, false);
        textarea.focus();
        document.execCommand('insertText', false, formatted);
        isFormattingRef.current = true;
    };
    const handleCopy = (textToCopy: string, index: number) => {
        if (!textToCopy.trim()) return;
        const resultPart = textToCopy
        navigator.clipboard.writeText(resultPart).then(() => {
            setCopiedLineIndex(index);
            setTimeout(() => {
                setCopiedLineIndex(null);
            }, 2000);
        }).catch(err => {
            console.error('无法复制文本: ', err);
        });
    };
    return (
        <div className="container mx-auto p-4 grid grid-cols-2 gap-4 ">
            <div className="flex flex-col space-y-2 ">
                <Textarea
                    ref={textareaRef}
                    value={lines.input}
                    onChange={handleInput}
                    onPaste={handlePaste}
                    placeholder={Configs.DefaultTxt}
                    // 对齐修正 "leading-8" 与右侧 h-8 对应，确保每行高度一致
                    className="w-full min-h-[calc(90vh-1rem)] md:text-2xl font-mono leading-8"
                />
            </div>
            
            <div className="flex flex-col space-y-2">
                {/* 对齐修正 使用与Textarea相同的 px-3 py-2, 并继承字体和行高样式 */}
                <div className="w-full min-h-[calc(90vh-1rem)] font-bold md:text-2xl font-mono leading-8 px-3 py-2 border bg-background rounded-md overflow-y-auto">
                    {lines.result.map((line, index) => (
                        // 对齐修正 `h-8` 确保此容器高度与 `leading-8` 的行高完全匹配
                        <div
                            key={index}
                            className="group flex justify-between items-center h-8" 
                        >
                            {/* 使用 <pre> 保留空格，font-bold 让结果突出 */}
                            <pre className="font-bold">
                                {/* --- 使用 span 包裹文本，并根据悬停状态动态应用样式 --- */}
                                <span className={`transition-colors duration-150 rounded px-1 ${
                                    hoveredLineIndex === index ? 'bg-muted' : 'bg-transparent'
                                }`}>
                                    {/* --- 对齐修正: 处理空行 --- */}
                                    {/* 如果行为空，渲染一个空格，使其占据一行的高度 */}
                                    {line || <>&nbsp;</>}
                                </span>
                            </pre>
                            {line.trim() && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => handleCopy(line, index)}
                                    // --- 鼠标进入和离开事件，用于更新悬停状态 ---
                                    onMouseEnter={() => setHoveredLineIndex(index)}
                                    onMouseLeave={() => setHoveredLineIndex(null)}
                                >
                                    {copiedLineIndex === index ? (
                                        <Check className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <Copy className="h-4 w-4" />
                                    )}
                                    <span className="sr-only">复制此行</span>
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
