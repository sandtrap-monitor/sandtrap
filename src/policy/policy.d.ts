
declare const enum Override { Expose, Protect, None }

declare const enum Action {
    Read,
    Write,
    Call,
    Construct
}

// contextification interface

interface IContextifyGetterSetterPolicy {
    Get: IContextifyEntityPolicy;
    Set: IContextifyEntityPolicy;
}

// ---

interface IContextifyPropertyPolicy {
    Policy: IPolicy;

    Read: boolean;
    Write: boolean;

    ReadPolicy: IContextifyEntityPolicy;
    WritePolicy: IDecontextifyEntityPolicy;

    // implemeneted using the read and write policy
    getOwnPropertyDescriptorPolicy: IContextifyGetterSetterPolicy;

    // implemeneted using the read and write policy
    definePropertyDescriptor: IDecontextifyGetterSetterPolicy;
}

// ---

interface IContextifyEntityPolicy {
    Policy: IPolicy;

    Invalidate(): void;

    GetContextifyDefault(action: Action, path: string): boolean;
    GetDecontextifyDefault(action: Action, path: string): boolean;

    Override: Override;

    GetProperty(key: PropertyKey): IContextifyPropertyPolicy;
    Call: IContextifyCallPolicy;
    Construct: IContextifyConstructPolicy;
}

// ---

interface IContextifyCCPolicyBase {
    ThisArg: IDecontextifyEntityPolicy;
    Arguments(index: number, args: ArrayLike<any>): IDecontextifyEntityPolicy;
    Result: IContextifyEntityPolicy;
}

interface IContextifyCallPolicy extends IContextifyCCPolicyBase {
    Allow: (thisArg: any, ...args: any[]) => boolean;
}

interface IContextifyConstructPolicy extends IContextifyCCPolicyBase {
    Allow: (...args: any[]) => boolean;
}

// decontextification interface

interface IDecontextifyGetterSetterPolicy {
    Get: IDecontextifyEntityPolicy;
    Set: IDecontextifyEntityPolicy;
}

// ---

interface IDecontextifyPropertyPolicy {
    Policy: IPolicy;

    Read: boolean;
    Write: boolean;

    ReadPolicy: IDecontextifyEntityPolicy;
    WritePolicy: IContextifyEntityPolicy;

    // implemeneted using the read and write policy
    getOwnPropertyDescriptorPolicy: IDecontextifyGetterSetterPolicy;

    // implemeneted using the read and write policy
    definePropertyDescriptor: IContextifyGetterSetterPolicy;
}

// ---

interface IDecontextifyEntityPolicy {
    Policy: IPolicy;

    Invalidate(): void;

    GetContextifyDefault(action: Action, path: string): boolean;
    GetDecontextifyDefault(action: Action, path: string): boolean;

    Override: Override;

    GetProperty(key: PropertyKey): IDecontextifyPropertyPolicy;
    Call: IDecontextifyCallPolicy;
    Construct: IDecontextifyConstructPolicy;
}

// ---

interface IDecontextifyCCPolicyBase {
    ThisArg: IContextifyEntityPolicy,
    Arguments(index: number, args: ArrayLike<any>): IContextifyEntityPolicy,
    Result: IDecontextifyEntityPolicy
}

interface IDecontextifyCallPolicy extends IDecontextifyCCPolicyBase {
    Allow: (thisArg: any, ...args: any[]) => boolean;
}

interface IDecontextifyConstructPolicy extends IDecontextifyCCPolicyBase {
    Allow: (...args: any[]) => boolean;
}

// policy interface

type PolicyParameterData = { [key: string]: string }

interface IPolicyParameters {
    Get(id: string): string;
}

interface IPolicy {

    Global: IContextifyEntityPolicy;

    Throw: boolean;
    Warn: boolean;
    Silent: boolean;

    ReportViolation(msg: string): void;

    WriteDelay: number;

    Parameters: IPolicyParameters;

    RegisterInManifest(id: string, data: object): void;
    Invalidate(): void;

    Require(id: string): IContextifyEntityPolicy | undefined;

    GetContextifyDefault(action: Action, path: string): boolean;
    GetDecontextifyDefault(action: Action, path: string): boolean;

    GetContextifyEntityPolicy(path: string): IContextifyEntityPolicy;
    GetDecontextifyEntityPolicy(path: string): IDecontextifyEntityPolicy;

    GetEntityPolicyData(id: string): EntityPolicyData | undefined;
    SetEntityPolicyData(id: string, policy: EntityPolicyData): void;
}
