// --  type of the nodejs global object

interface Global {
    Buffer: typeof Buffer;
    clearImmediate: (immediateId: NodeJS.Immediate) => void;
    clearInterval: (intervalId: NodeJS.Timeout) => void;
    clearTimeout: (timeoutId: NodeJS.Timeout) => void;
    console: typeof console;
    global: Global;
    process: NodeJS.Process;
    setImmediate: (callback: (...args: any[]) => void, ...args: any[]) => NodeJS.Immediate;
    setInterval: (callback: (...args: any[]) => void, ms: number, ...args: any[]) => NodeJS.Timeout;
    setTimeout: (callback: (...args: any[]) => void, ms: number, ...args: any[]) => NodeJS.Timeout;
    queueMicrotask: typeof queueMicrotask;
}

// -- contextification

type IContextify = {
    <T>(entity: T, path: string, policy?: IContextifyEntityPolicy): T;
    Descriptor<T extends PropertyDescriptor>(entity: T, path: string, valuePolicy: IContextifyEntityPolicy, gettersetterPolicy: IContextifyGetterSetterPolicy): T;
    Arguments(args: ArrayLike<any>, path: string, policy: IDecontextifyCallPolicy): ArrayLike<any>;
}

type IDecontextify = {
    <T>(entity: T, path: string, policy?: IDecontextifyEntityPolicy): T;
    Descriptor<T extends PropertyDescriptor>(entity: T, path: string, valuePolicy: IDecontextifyEntityPolicy, gettersetterPolicy: IDecontextifyGetterSetterPolicy): T;
    Arguments(args: ArrayLike<any>, path: string, policy: IContextifyCallPolicy): ArrayLike<any>;
}

type ContextificationFunctor = (
    host: NodeJS.Global & typeof globalThis,
    SandTrapError: new (name?: string) => Error,
    Policy: IPolicy
) => {
    Decontextify: IDecontextify,
    Contextify: IContextify
};

// -- modules

interface SandTrapModule {
    id: string;
    path: string;
    exports: any;
    parent: SandTrapModule | null;
    filename: string | null;
    loaded: boolean;
    children: SandTrapModule[];
    paths: string[];

    load(filename: string): void;
    require(id: string): object;
}

interface SandTrapModuleConstructor {
    new(id: string, parent: SandTrapModule): SandTrapModule;
    _cache: NodeJS.Dict<SandTrapModule>;
    _extensions: { [key: string]: (module: SandTrapModule, filename: string) => void }
    _load(request: string, parent: SandTrapModule, isMain: boolean): object;
    _resolveFilename(id: string, parent: SandTrapModule, isMain: boolean): string;
}

type CommonJSFunctor = (
    host: NodeJS.Global & typeof globalThis,
    vmContext : object,
    SandTrapError: new (name?: string) => Error,
    require: NodeRequire,
    policy: IPolicy,
    Contextify: IContextify,
    Decontextify: IDecontextify
) => {
    SandTrapModule: SandTrapModuleConstructor,
    makeRequireFunction: (module: CommonJSFunctor) => Function
}