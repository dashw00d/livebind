/**
 * LiveBind Types
 * Shared interfaces and type definitions
 */

// ==================== CORE TYPES ====================

/**
 * HTTP request options
 */
export interface RequestOptions {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    params?: Record<string, unknown>;
}

/**
 * Unified HTTP response
 */
export interface RequestResponse {
    text: string;
    status: number;
    contentType: string;
}

/**
 * Custom event detail types
 */
export interface LiveBindEventDetail {
    container?: LiveBindContainer;
    triggerInput?: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    response?: RequestResponse;
    actionEl?: HTMLElement;
    actionParams?: Record<string, unknown>;
    error?: Error;
    status?: number;
    url?: string;
    target?: HTMLElement;
    input?: HTMLInputElement;
    xhr?: XMLHttpRequest;
}

// ==================== PLUGIN SYSTEM ====================

/**
 * Static interface for LiveBindCore class (avoids circular import)
 */
export interface LiveBindStatic {
    isOnline: boolean;
    offlineElements: Set<HTMLElement>;
    use(plugin: LiveBindPlugin): LiveBindStatic;
    getPlugin(name: string): LiveBindPlugin | undefined;
    request(options: RequestOptions): Promise<RequestResponse>;
    morph(target: Element, html: string): void;
    emit(container: Element, eventName: string, detail?: Record<string, unknown>): CustomEvent;
    debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void;
    throttle<T extends (...args: unknown[]) => void>(fn: T, limit: number): (...args: Parameters<T>) => void;
    initGlobal(): void;
    updateOutputs(data: Record<string, unknown>, container?: LiveBindContainer | null): void;
    setLoading(container: LiveBindContainer, isLoading: boolean): void;
    initialize(container: LiveBindContainer): void;
}

/**
 * Plugin interface for extending LiveBind
 */
export interface LiveBindPlugin {
    /** Unique plugin name */
    name: string;

    /** Called once when plugin is registered via .use() */
    setup?(livebind: LiveBindStatic): void;

    /** Called once globally (e.g., for global event listeners) */
    initGlobal?(livebind: LiveBindStatic): void;

    /** Called for each container that is initialized */
    initialize?(
        livebind: LiveBindStatic,
        container: LiveBindContainer,
        url: string
    ): void;

    /** Called when outputs are updated (for Alpine entanglement, etc.) */
    onUpdateOutputs?(
        livebind: LiveBindStatic,
        data: Record<string, unknown>,
        container: LiveBindContainer | null
    ): void;
}

// ==================== CONTAINER TYPES ====================

/**
 * Initial state for a live-target element
 */
export interface TargetInitialState {
    innerHTML: string;
    display: string;
}

/**
 * Extended HTMLElement with LiveBind properties
 */
export interface LiveBindContainer extends HTMLElement {
    _liveBindInitialized?: boolean;
    _liveBindInitialStates?: Map<string, TargetInitialState>;
    _liveBindInitialValues?: Map<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, string | boolean>;
    _liveBindIsDirty?: boolean;
    _liveBindStopPolling?: () => void;
    _loadingShowTimeout?: ReturnType<typeof setTimeout>;
    _loadingHideTimeout?: ReturnType<typeof setTimeout>;
}

// ==================== EXTERNAL LIBRARY TYPES ====================

/**
 * Unpoly types (minimal declarations for what we use)
 */
export interface UnpolyRequest {
    url: string;
    method: string;
    params?: Record<string, unknown>;
}

export interface UnpolyResponse {
    text: string;
    status?: number;
    contentType?: string;
}

declare global {
    interface Window {
        up?: {
            request(options: UnpolyRequest): Promise<UnpolyResponse>;
        };
        Idiomorph?: {
            morph(target: Element, html: string, options?: { morphStyle?: string }): void;
        };
        morphdom?: (
            target: Element,
            content: Element | DocumentFragment,
            options?: { childrenOnly?: boolean }
        ) => void;
        Alpine?: {
            $data(el: Element): Record<string, unknown> | undefined;
            effect(fn: () => void): void;
        };
    }
}

export { };
