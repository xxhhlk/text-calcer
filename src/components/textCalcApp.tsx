import { Textarea } from "@/components/ui/textarea";
import { useEffect, useRef, useState, ChangeEvent, ClipboardEvent } from 'react';
import { Configs } from '@/conf';
import { Button } from '@/components/ui/button';
import { Copy, Check, Github, ExternalLink } from 'lucide-react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useI18n } from '@/i18n/I18nProvider';
import { getLocaleUrl } from '@/lib/site';
import { syncSeoHead } from '@/lib/seo';
import { calculateResults } from '@/lib/calcCore';
import { formatSpacing, getNewCursorPos } from '@/lib/textFormat';

const APP_TITLE = 'Text Calculator';
const DECIMAL_PLACES_STORAGE_KEY = 'text-calcer-decimal-places';
const MIN_DECIMAL_PLACES = 0;
const MAX_DECIMAL_PLACES = 8;
const DECIMAL_PLACE_OPTIONS = Array.from(
    { length: MAX_DECIMAL_PLACES - MIN_DECIMAL_PLACES + 1 },
    (_, index) => index + MIN_DECIMAL_PLACES,
);

function clampDecimalPlaces(value: number): number {
    return Math.min(MAX_DECIMAL_PLACES, Math.max(MIN_DECIMAL_PLACES, value));
}

function readStoredDecimalPlaces(): number {
    try {
        const savedValue = localStorage.getItem(DECIMAL_PLACES_STORAGE_KEY);
        const parsedValue = Number.parseInt(savedValue ?? '', 10);
        if (Number.isNaN(parsedValue)) {
            return 4;
        }
        return clampDecimalPlaces(parsedValue);
    } catch {
        return 4;
    }
}

export function TextCalcApp() {
    const { locale, messages } = useI18n();
    const [decimalPlaces, setDecimalPlaces] = useState<number>(() => readStoredDecimalPlaces());
    const [lines, setLines] = useState<{ input: string; result: string[] }>(() => {
        const savedInput = localStorage.getItem('calcInput') || '';
        return {
            input: savedInput,
            result: savedInput !== '' ? calculateResults(savedInput, messages, locale, decimalPlaces) : []
        };
    });
    const [copiedLineIndex, setCopiedLineIndex] = useState<number | null>(null);
    // --- 用于追踪鼠标悬停的行 ---
    const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // --- 自动加空格相关 ---
    const prevValueRef = useRef<string>(lines.input);
    const isFormattingRef = useRef(false);
    const trimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleDecimalPlacesChange = (value: string) => {
        const parsedValue = Number.parseInt(value, 10);
        const nextValue = clampDecimalPlaces(Number.isNaN(parsedValue) ? 4 : parsedValue);
        setDecimalPlaces(nextValue);
        localStorage.setItem(DECIMAL_PLACES_STORAGE_KEY, String(nextValue));
    };

    const showNotice = (message: string) => {
        if (noticeTimerRef.current) {
            clearTimeout(noticeTimerRef.current);
        }

        setNotice(message);
        noticeTimerRef.current = setTimeout(() => {
            setNotice(null);
            noticeTimerRef.current = null;
        }, 1500);
    };

    const resetWorkspace = () => {
        setLines({ input: '', result: [] });
        localStorage.removeItem('calcInput');
        setCopiedLineIndex(null);
        setHoveredLineIndex(null);
        prevValueRef.current = '';
        showNotice(messages.notices.cleared);
        textareaRef.current?.focus();
    };

    /** 把已格式化的文本写回 textarea，并恢复光标位置（保证 undo 可用） */
    const applyFormattedValue = (formatted: string, newCursorPos: number) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        textarea.focus();
        document.execCommand('selectAll', false);
        document.execCommand('insertText', false, formatted);

        isFormattingRef.current = true;
        textarea.setSelectionRange(newCursorPos, newCursorPos);

        setLines({ input: formatted, result: calculateResults(formatted, messages, locale, decimalPlaces) });
        localStorage.setItem('calcInput', formatted);
        prevValueRef.current = formatted;
    };

    /** 延迟清理行尾空格（保留输入过程中的尾随空格，5s 后统一去掉） */
    const scheduleTrailingSpaceCleanup = () => {
        if (trimTimerRef.current) {
            clearTimeout(trimTimerRef.current);
        }
        trimTimerRef.current = setTimeout(() => {
            const current = textareaRef.current?.value ?? '';
            const trimmed = formatSpacing(current, false);
            if (trimmed !== current) {
                const cursorPos = textareaRef.current?.selectionStart ?? 0;
                applyFormattedValue(trimmed, getNewCursorPos(current, trimmed, cursorPos));
            }
        }, 5000);
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
            setLines({ input: value, result: calculateResults(value, messages, locale, decimalPlaces) });
            localStorage.setItem('calcInput', value);
            prevValueRef.current = value;
            return;
        }

        const isDelete = value.length < prevValueRef.current.length;

        // 只在新增输入时自动加空格，避免删除时反复回填
        if (!isDelete) {
            const formatted = formatSpacing(value, true);
            if (formatted !== value) {
                const cursorPos = textarea.selectionStart ?? 0;
                applyFormattedValue(formatted, getNewCursorPos(value, formatted, cursorPos));
                scheduleTrailingSpaceCleanup();
                return;
            }
        }

        setLines({ input: value, result: calculateResults(value, messages, locale, decimalPlaces) });
        localStorage.setItem('calcInput', value);
        prevValueRef.current = value;
        scheduleTrailingSpaceCleanup();
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

    const matchesShortcut = (
        event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>,
    ) => {
        const shortcut = Configs.ClearWorkspaceShortcut.trim().toLowerCase();
        const tokens = shortcut
            .split('+')
            .map((part) => part.trim())
            .filter(Boolean);

        if (tokens.length === 0) return false;

        const key = tokens[tokens.length - 1];
        const modifiers = new Set(tokens.slice(0, -1));

        return (
            event.key.toLowerCase() === key &&
            event.ctrlKey === modifiers.has('ctrl') &&
            event.shiftKey === modifiers.has('shift') &&
            event.altKey === modifiers.has('alt') &&
            event.metaKey === modifiers.has('meta')
        );
    };

    const handleWindowKeyDown = (event: KeyboardEvent) => {
        if (event.isComposing) return;
        if (!matchesShortcut(event)) return;

        event.preventDefault();
        event.stopPropagation();
        resetWorkspace();
    };

    const handleCopy = (textToCopy: string, index: number) => {
        if (!textToCopy.trim()) return;
        const resultPart = textToCopy
        navigator.clipboard.writeText(resultPart).then(() => {
            setCopiedLineIndex(index);
            setTimeout(() => {
                setCopiedLineIndex(null);
            }, 2000);
        }).catch(() => {
            showNotice(messages.notices.copyFailed);
        });
    };

    useEffect(() => {
        return () => {
            if (noticeTimerRef.current) {
                clearTimeout(noticeTimerRef.current);
            }
            if (trimTimerRef.current) {
                clearTimeout(trimTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        window.addEventListener('keydown', handleWindowKeyDown);

        return () => {
            window.removeEventListener('keydown', handleWindowKeyDown);
        };
    }, [handleWindowKeyDown]);

    useEffect(() => {
        setLines((prev) => {
            if (prev.input === '') {
                return prev;
            }

            return {
                ...prev,
                result: calculateResults(prev.input, messages, locale, decimalPlaces),
            };
        });
    }, [decimalPlaces, locale, messages]);

    useEffect(() => {
        syncSeoHead({
            title: messages.seo.title,
            description: messages.seo.description,
            siteName: messages.seo.siteName,
            canonicalUrl: getLocaleUrl(locale),
            locale,
            alternateUrls: [
                { locale: 'zh-CN', url: getLocaleUrl('zh-CN') },
                { locale: 'en-US', url: getLocaleUrl('en-US') },
            ],
        });
    }, [locale, messages]);

    const shortcutLabel = Configs.ClearWorkspaceShortcut
        .split('+')
        .map((part) => {
            const normalized = part.trim();
            if (!normalized) return '';
            if (normalized.length === 1) {
                return normalized.toUpperCase();
            }
            return normalized[0].toUpperCase() + normalized.slice(1);
        })
        .filter(Boolean)
        .join(' + ');

    const hasResults = lines.result.length > 0;
    const isIdle = lines.input === '' && !hasResults;

    return (
        <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,1)_36%,rgba(244,246,248,0.98)_100%)]">
            <div className="pointer-events-none absolute inset-0 -z-10">
                <div className="absolute -left-24 top-[-4rem] h-80 w-80 rounded-full bg-amber-200/30 blur-3xl" />
                <div className="absolute right-[-5rem] top-32 h-96 w-96 rounded-full bg-slate-200/45 blur-3xl" />
            </div>

            <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
                <header className="rounded-3xl border border-slate-200/80 bg-white/85 px-5 py-2 shadow-[0_14px_34px_-34px_rgba(15,23,42,0.42)] backdrop-blur">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <h1 className="select-none text-[15px] font-medium tracking-tight text-slate-500 sm:text-base">
                            {APP_TITLE}
                        </h1>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <a
                                    href="https://blog.knowckx.de/"
                                    target="_blank"
                                    rel="noopener"
                                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50/90 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900"
                                    aria-label={messages.links.blog}
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    <span>{messages.links.blog}</span>
                                </a>
                                <a
                                    href="https://github.com/Knowckx/text-calcer"
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                                    aria-label={messages.links.github}
                                >
                                    <Github className="h-4 w-4" />
                                    <span>{messages.links.github}</span>
                                </a>
                            </div>

                            <div className="hidden h-6 w-px bg-slate-200/80 sm:block" aria-hidden="true" />

                            <div className="flex flex-wrap items-center gap-2">
                                <div className="min-h-7">
                                    {notice ? (
                                        <div
                                            className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-sm font-medium text-emerald-700 shadow-none"
                                            role="status"
                                            aria-live="polite"
                                        >
                                            {notice}
                                        </div>
                                    ) : null}
                                </div>
                                <label className="inline-flex h-8 items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-3 text-sm text-slate-700 shadow-sm">
                                    <span className="whitespace-nowrap font-medium text-slate-600">
                                        {messages.settings.decimalPlaces}
                                    </span>
                                    <select
                                        value={decimalPlaces}
                                        onChange={(e) => handleDecimalPlacesChange(e.target.value)}
                                        className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-sm font-medium text-slate-800 outline-none"
                                        aria-label={messages.settings.decimalPlaces}
                                    >
                                        {DECIMAL_PLACE_OPTIONS.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={resetWorkspace}
                                    className="h-8 rounded-full border-slate-300 bg-white/90 px-3.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                                >
                                    {messages.actions.clear}
                                    <kbd className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                        {shortcutLabel}
                                    </kbd>
                                </Button>
                                <LanguageSwitcher />
                            </div>
                        </div>
                    </div>
                </header>

                <main className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
                    <section className="flex min-h-[calc(90vh-7rem)] flex-col gap-2.5 rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.5)]">
                        <div className="pb-0.5 pl-0.5 text-[12px] font-medium leading-4 text-slate-400">
                            {messages.titles.input}
                        </div>
                        <Textarea
                            ref={textareaRef}
                            value={lines.input}
                            onChange={handleInput}
                            onPaste={handlePaste}
                            placeholder={messages.placeholders.formula}
                            className="min-h-[min(72vh,960px)] flex-1 rounded-2xl border-slate-200 bg-white/95 p-4 font-mono text-[18px] leading-8 text-slate-900 shadow-inner shadow-slate-100/70 placeholder:text-slate-400 md:text-xl"
                        />
                    </section>

                    <section className="flex min-h-[calc(90vh-7rem)] flex-col gap-2.5 rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.5)]">
                        <div className="pb-0.5 pl-0.5 text-[12px] font-medium leading-4 text-slate-400">
                            {messages.titles.result}
                        </div>

                        <div className="flex min-h-[min(72vh,960px)] flex-1 flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-inner shadow-slate-100/70">
                            {hasResults ? (
                                <div className="font-mono text-[18px] font-bold leading-8 text-slate-900 md:text-xl">
                                    {lines.result.map((line, index) => (
                                        <div
                                            key={index}
                                            className="group flex h-8 items-center justify-between gap-3 rounded-lg px-2 transition-colors hover:bg-slate-100/60"
                                        >
                                            <pre className="truncate font-bold">
                                                <span className={`rounded px-1 transition-colors duration-150 ${
                                                    hoveredLineIndex === index ? 'bg-slate-200/80' : 'bg-transparent'
                                                }`}>
                                                    {line || <>&nbsp;</>}
                                                </span>
                                            </pre>
                                            {line.trim() && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 shrink-0 rounded-full text-slate-500 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-slate-200/60 hover:text-slate-900"
                                                    onClick={() => handleCopy(line, index)}
                                                    onMouseEnter={() => setHoveredLineIndex(index)}
                                                    onMouseLeave={() => setHoveredLineIndex(null)}
                                                >
                                                    {copiedLineIndex === index ? (
                                                        <Check className="h-4 w-4 text-emerald-600" />
                                                    ) : (
                                                        <Copy className="h-4 w-4" />
                                                    )}
                                                    <span className="sr-only">{messages.actions.copyLine}</span>
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : isIdle ? (
                                <div className="flex flex-1 items-center justify-center text-left">
                                    <div className="max-w-md space-y-5">
                                        <div className="space-y-2">
                                            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                                                {messages.titles.quickTips}
                                            </div>
                                            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                                                {messages.emptyState.heading}
                                            </h2>
                                            <p className="text-sm leading-6 text-slate-600">
                                                {messages.emptyState.description}
                                            </p>
                                        </div>

                                        <div className="grid gap-3 text-sm text-slate-700">
                                            <div className="rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 shadow-sm">
                                                {messages.emptyState.bullet1}
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 shadow-sm">
                                                {messages.emptyState.bullet2}
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 shadow-sm">
                                                {messages.emptyState.bullet3}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-1 items-center justify-center text-center">
                                    <div className="max-w-sm space-y-2">
                                        <div className="text-base font-semibold text-slate-700">
                                            {messages.noResults.heading}
                                        </div>
                                        <div className="text-sm leading-6 text-slate-500">
                                            {messages.noResults.description}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}
