import { SandTrapError } from "../sandtrap";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline-sync";
import * as beautifyAux from "json-beautify";

function beautify(o: any): string {
    //@ts-ignore
    return beautifyAux(o, null, 2);
}
// ---

export class ContextifyPropertyPolicy implements IContextifyPropertyPolicy {

    Policy: IPolicy;
    Parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy

    Path: string;
    Data: PropertyPolicyData;

    constructor(policy: IPolicy, parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy, data: PropertyPolicyData, path: string) {
        this.Policy = policy;
        this.Parent = parent;
        this.Path = path;
        this.Data = data;
    }

    get Read(): boolean {
        if (this.Data.read === undefined) {
            this.Data.read = this.Parent.GetContextifyDefault(Action.Read, this.Path);
            this.Parent.Invalidate();
        }

        if (!this.Data.read) {
            if (this.Policy.Throw) {
                throw new PolicyError(`Contextify read action on path ${this.Path} denied.`);
            }

            if (this.Policy.Warn) {
                console.warn(`Contextify read action on path ${this.Path} denied.`);
            }
        }

        return this.Data.read;
    }

    get Write(): boolean {
        if (this.Data.write === undefined) {
            this.Data.write = this.Parent.GetContextifyDefault(Action.Write, this.Path);
            this.Parent.Invalidate();
        }

        if (!this.Data.write) {
            this.Policy.ReportViolation(`Contextify write action on path ${this.Path} denied.`);
        }

        return this.Data.write;
    }

    get ReadPolicy(): ContextifyEntityPolicy {
        if (this.Data.readPolicy === undefined) {
            this.Data.readPolicy = this.Path;
            this.Parent.Invalidate();
        }

        return new ContextifyEntityPolicy(this.Policy, this.Parent, this.Data.readPolicy, this.Path);
    }

    get WritePolicy(): DecontextifyEntityPolicy {
        if (this.Data.writePolicy === undefined) {
            this.Data.writePolicy = this.Path;
            this.Parent.Invalidate();
        }

        return new DecontextifyEntityPolicy(this.Policy, this.Parent, this.Data.writePolicy, this.Path);
    }


    // implemeneted using the read and write policy
    get getOwnPropertyDescriptorPolicy(): IContextifyGetterSetterPolicy {

        let self = this;

        let getPolicy: EntityPolicyData = {
            get call() {
                if (self.Data.readPolicy === undefined) {
                    self.Data.readPolicy = Object.create(null);
                    self.Parent.Invalidate();
                }

                return {
                    allow: self.Read,
                    result: self.Data.readPolicy
                }
            }
        };

        let setPolicy: EntityPolicyData = {
            get call() {
                if (self.Data.writePolicy === undefined) {
                    self.Data.writePolicy = Object.create(null);
                    self.Parent.Invalidate();
                }

                return {
                    allow: self.Write,
                    arguments: [self.Data.writePolicy]
                }
            }
        };

        return {
            Get: new ContextifyEntityPolicy(this.Policy, this.Parent, getPolicy, this.Path),
            Set: new ContextifyEntityPolicy(this.Policy, this.Parent, setPolicy, this.Path)

        }
    }

    // implemeneted using the read and write policy
    get definePropertyDescriptor(): IDecontextifyGetterSetterPolicy {

        let self = this;

        let getPolicy: EntityPolicyData = {

            get call() {
                if (self.Data.readPolicy === undefined) {
                    self.Data.readPolicy = Object.create(null);
                    self.Parent.Invalidate();
                }
                return {
                    allow: self.Write,
                    result: self.Data.writePolicy
                }
            }
        };

        let setPolicy: EntityPolicyData = {
            get call() {
                if (self.Data.writePolicy === undefined) {
                    self.Data.writePolicy = Object.create(null);
                    self.Parent.Invalidate();
                }
                return {
                    allow: self.Read,
                    arguments: [self.Data.readPolicy]
                }
            }
        };

        return {
            Get: new DecontextifyEntityPolicy(this.Policy, this.Parent, getPolicy, this.Path),
            Set: new DecontextifyEntityPolicy(this.Policy, this.Parent, setPolicy, this.Path)

        }
    }

}

// ---

export class ContextifyCCPolicyBase {
    Policy: IPolicy;
    Parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy

    Path: string;
    Data: CallPolicyData;


    constructor(policy: IPolicy, parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy, data: CallPolicyData, path: string) {
        this.Policy = policy;
        this.Parent = parent

        this.Path = path;
        this.Data = data;
    }

    GetPolicyParameter(id: string): string {
        return this.Policy.Parameters.Get(id);
    }

    get ThisArg(): IDecontextifyEntityPolicy {
        if (this.Data.thisArg === undefined) {
            this.Data.thisArg = Object.create(null) as object;
            this.Parent.Invalidate();
        }

        return new DecontextifyEntityPolicy(this.Policy, this.Parent, this.Data.thisArg, this.Path);
    }

    Arguments(index: number, args: ArrayLike<any>): IDecontextifyEntityPolicy {

        if (this.Data.arguments === undefined) {
            this.Data.arguments = [];
            // we don't have to save here, since next if will be triggered
        }

        if (this.Data.arguments[index] === undefined) {
            this.Data.arguments[index] = Object.create(null);
            this.Parent.Invalidate();
        }

        let argumentPolicy = this.Data.arguments[index] as EntityPolicyData | ArgumentPolicyData[] | string;

        let policy: EntityPolicyData | string = Object.create(null);

        if (argumentPolicy instanceof Array) {
            for (let i = 0; i <= argumentPolicy.length; i++) {
                let depPolicy = argumentPolicy[i];

                if (depPolicy.dependency === undefined || depPolicy.expected === undefined) {
                    policy = depPolicy.policy;
                    break;
                }

                if (args[depPolicy.dependency] === depPolicy.expected) {
                    policy = depPolicy.policy;
                    break;
                }

                // we are at last index and we did not find a matcing policy, add a default policy at the end
                if (i === argumentPolicy.length - 1) {
                    let depPolicy = Object.create(null);
                    depPolicy.policy = policy;
                    argumentPolicy[i + 1] = depPolicy;
                    this.Parent.Invalidate();

                }
            }
        } else {
            policy = argumentPolicy;
        }

        return new DecontextifyEntityPolicy(this.Policy, this.Parent, policy, `${this.Path}[${index}]`);
    }

    get Result(): IContextifyEntityPolicy {
        if (this.Data.result === undefined) {
            this.Data.result = Object.create(null) as object;
            this.Parent.Invalidate();
        }

        return new ContextifyEntityPolicy(this.Policy, this.Parent, this.Data.result, this.Path);
    }



}

// ---

export class ContextifyCallPolicy extends ContextifyCCPolicyBase implements IContextifyCallPolicy {

    constructor(policy: IPolicy, parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy, data: CallPolicyData, path: string) {
        super(policy, parent, data, path);
    }

    get Allow(): (thisArg: any, ...args: any[]) => boolean {
        if (this.Data.allow === undefined) {
            this.Data.allow = this.Parent.GetContextifyDefault(Action.Call, this.Path);
            this.Parent.Invalidate();
        }

        let fun: (...args: any[]) => boolean;
        if (typeof this.Data.allow === "string") {
            try {
                fun = eval(this.Data.allow);
                if (!(fun instanceof Function)) {
                    throw new PolicyError(`Function guards must be functions, got ${fun}`);
                }
            } catch (e) {
                console.log(e);
                fun = () => false;
            }
        } else {
            fun = () => !!this.Data.allow;
        }

        let self = this;

        let reporter = function (thisArg: any, ...args: any[]): boolean {
            let result;
            if (thisArg === undefined) {
                result = fun(...args);
            } else {
                result = fun(thisArg, ...args);
            }

            if (!result) {
                self.Policy.ReportViolation(`Contextify call action on path ${self.Path} denied.`);
            }
            return result;
        }

        return reporter;
    }
}

// ---

export class ContextifyConstructPolicy extends ContextifyCCPolicyBase implements IContextifyConstructPolicy {

    constructor(policy: IPolicy, parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy, data: CallPolicyData, path: string) {
        super(policy, parent, data, path);
    }

    get Allow(): (...args: any[]) => boolean {
        if (this.Data.allow === undefined) {
            this.Data.allow = this.Parent.GetContextifyDefault(Action.Construct, this.Path);
            this.Parent.Invalidate();
        }

        let fun: (...args: any[]) => boolean;
        if (typeof this.Data.allow === "string") {
            try {
                fun = eval(this.Data.allow);
                if (!(fun instanceof Function)) {
                    throw new PolicyError(`Function guards must be functions, got ${fun}`);
                }
            } catch (e) {
                console.log(e);
                fun = () => false;
            }
        } else {
            fun = () => !!this.Data.allow;
        }

        let self = this;

        let reporter = function (...args: any[]): boolean {
            let result = fun(...args);
            if (!result) {
                self.Policy.ReportViolation(`Contextify construct action on path ${self.Path} denied.`);
            }
            return result;
        }
        return reporter;
    }


}

// ---

export class ContextifyEntityPolicy implements IContextifyEntityPolicy {

    Policy: IPolicy;
    Parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy | null;

    Path: string;

    Data: EntityPolicyData;
    Properties: { [key: string]: ContextifyPropertyPolicy } = Object.create(null);

    constructor(policy: IPolicy, parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy | null, data: EntityPolicyData | string, path: string) {
        this.Policy = policy;
        this.Parent = parent;

        this.Path = path;

        this.Data = this.Resolve(data);
    }

    get Override(): Override {
        if (this.Data.override === "expose") {
            return Override.Expose;
        }

        if (this.Data.override === "protect") {
            return Override.Protect;
        }

        return Override.None
    }

    GetProperty(key: PropertyKey): ContextifyPropertyPolicy {
        let sKey = String(key);

        if (this.Properties[String(sKey)] === undefined) {
            let modified = false;
            if (!this.Data.properties) {
                this.Data.properties = Object.create(null) as { [key: string]: PropertyPolicyData };
                modified = true;
            }

            if (!this.Data.properties[sKey]) {
                this.Data.properties[sKey] = Object.create(null);
                modified = true;
            }

            this.Properties[sKey] = new ContextifyPropertyPolicy(this.Policy, this, this.Data.properties[sKey], `${this.Path}/${sKey}`);

            if (modified) {
                this.Invalidate();
            }
        }

        return this.Properties[sKey];
    }



    get Call(): IContextifyCallPolicy {
        if (this.Data.call === undefined) {
            this.Data.call = Object.create(null) as object;
            this.Invalidate();
        }

        return new ContextifyCallPolicy(this.Policy, this, this.Data.call, this.Path);
    }

    get Construct(): IContextifyConstructPolicy {
        if (this.Data.construct === undefined) {
            this.Data.construct = Object.create(null) as object;
            this.Invalidate();
        }

        return new ContextifyConstructPolicy(this.Policy, this, this.Data.construct, this.Path);
    }

    Resolve(data: EntityPolicyData | string): EntityPolicyData {
        if (typeof data !== "string") {
            return data;
        }

        let cPolicy = this.Policy.GetEntityPolicyData(data);
        if (cPolicy === undefined) {
            cPolicy = { type: "contextify" };
            this.Policy.SetEntityPolicyData(this.Path, cPolicy);
            this.Policy.RegisterInManifest(this.Path, cPolicy);
        }
        return cPolicy;
    }

    Invalidate() {
        if (!this.Data.options || !!this.Data.options.learn) {
            this.Policy.Invalidate();
        }
    }

    GetContextifyDefault(action: Action, path: string): boolean {
        if (this.Data.options !== undefined) {
            return GetContextifyDefault(this.Data.options, action, path);
        }

        if (this.Parent !== null) {
            return this.Parent.GetContextifyDefault(action, path);
        }

        return this.Policy.GetContextifyDefault(action, path);
    }

    GetDecontextifyDefault(action: Action, path: string): boolean {
        if (this.Data.options !== undefined) {
            return GetDecontextifyDefault(this.Data.options, action, path);
        }

        if (this.Parent !== null) {
            return this.Parent.GetDecontextifyDefault(action, path);
        }

        return this.Policy.GetDecontextifyDefault(action, path);
    }

}

// ---

export class DecontextifyPropertyPolicy implements IDecontextifyPropertyPolicy {

    Policy: IPolicy;
    Parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy

    Path: string;
    Data: PropertyPolicyData;

    constructor(policy: IPolicy, parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy, data: PropertyPolicyData, path: string) {
        this.Policy = policy;
        this.Parent = parent;
        this.Path = path;
        this.Data = data;
    }

    get Read(): boolean {
        if (this.Data.read === undefined) {
            this.Data.read = this.Parent.GetDecontextifyDefault(Action.Read, this.Path);
            this.Parent.Invalidate();
        }


        if (!this.Data.read) {
            this.Policy.ReportViolation(`Decontextify read action on path ${this.Path} denied.`);
        }

        return this.Data.read;
    }

    get Write(): boolean {
        if (this.Data.write === undefined) {
            this.Data.write = this.Parent.GetDecontextifyDefault(Action.Write, this.Path);
            this.Parent.Invalidate();
        }

        if (!this.Data.write) {
            this.Policy.ReportViolation(`Decontextify write action on path ${this.Path} denied.`);
        }

        return this.Data.write;
    }

    get ReadPolicy(): DecontextifyEntityPolicy {
        if (this.Data.readPolicy === undefined) {
            this.Data.readPolicy = this.Path;
            this.Parent.Invalidate();
        }

        return new DecontextifyEntityPolicy(this.Policy, this.Parent, this.Data.readPolicy, this.Path);
    }


    get WritePolicy(): ContextifyEntityPolicy {
        if (this.Data.writePolicy === undefined) {
            this.Data.writePolicy = this.Path;
            this.Parent.Invalidate();
        }

        return new ContextifyEntityPolicy(this.Policy, this.Parent, this.Data.writePolicy, this.Path);
    }

    // implemeneted using the read and write policy
    get getOwnPropertyDescriptorPolicy(): IDecontextifyGetterSetterPolicy {

        let self = this;

        let getPolicy: EntityPolicyData = {

            get call() {
                if (self.Data.readPolicy === undefined) {
                    self.Data.readPolicy = Object.create(null);
                    self.Parent.Invalidate();
                }

                return {
                    allow: self.Read,
                    result: self.Data.readPolicy
                }
            }
        };

        let setPolicy: EntityPolicyData = {
            get call() {
                if (self.Data.writePolicy === undefined) {
                    self.Data.writePolicy = Object.create(null);
                    self.Parent.Invalidate();
                }

                return {
                    allow: self.Write,
                    arguments: [self.Data.writePolicy]
                }
            }
        };

        return {
            Get: new DecontextifyEntityPolicy(this.Policy, this.Parent, getPolicy, this.Path),
            Set: new DecontextifyEntityPolicy(this.Policy, this.Parent, setPolicy, this.Path)

        }
    }


    // implemeneted using the read and write policy
    get definePropertyDescriptor(): IContextifyGetterSetterPolicy {

        let self = this;

        let getPolicy: EntityPolicyData = {
            get call() {
                if (self.Data.readPolicy === undefined) {
                    self.Data.readPolicy = Object.create(null);
                    self.Parent.Invalidate();
                }

                return {
                    allow: self.Read,
                    result: self.Data.writePolicy
                }
            }
        };

        let setPolicy: EntityPolicyData = {
            get call() {
                if (self.Data.writePolicy === undefined) {
                    self.Data.writePolicy = Object.create(null);
                    self.Parent.Invalidate();
                }

                return {
                    allow: self.Write,
                    arguments: [self.Data.readPolicy]
                }
            }
        };

        return {
            Get: new ContextifyEntityPolicy(this.Policy, this.Parent, getPolicy, this.Path),
            Set: new ContextifyEntityPolicy(this.Policy, this.Parent, setPolicy, this.Path)

        }
    }

}

// ---

export class DecontextifyCCPolicyBase {
    Policy: IPolicy;
    Parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy

    Path: string;
    Data: CallPolicyData;

    constructor(policy: IPolicy, parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy, data: CallPolicyData, path: string) {
        this.Policy = policy;
        this.Parent = parent;

        this.Path = path;
        this.Data = data;
    }

    GetPolicyParameter(id: string): string {
        return this.Policy.Parameters.Get(id);
    }

    get ThisArg(): IContextifyEntityPolicy {
        if (this.Data.thisArg === undefined) {
            this.Data.thisArg = Object.create(null) as object;
            this.Parent.Invalidate();
        }

        return new ContextifyEntityPolicy(this.Policy, this.Parent, this.Data.thisArg, this.Path);
    }

    Arguments(index: number, args: ArrayLike<any>): IContextifyEntityPolicy {

        if (this.Data.arguments === undefined) {
            this.Data.arguments = [];
            // we don't have to save here, since next if will be triggered
        }

        if (this.Data.arguments[index] === undefined) {
            this.Data.arguments[index] = Object.create(null);
            this.Parent.Invalidate();
        }

        let argumentPolicy = this.Data.arguments[index] as EntityPolicyData | ArgumentPolicyData[] | string;

        let policy: EntityPolicyData | string = Object.create(null);

        if (argumentPolicy instanceof Array) {
            for (let i = 0; i <= argumentPolicy.length; i++) {
                let depPolicy = argumentPolicy[i];

                if (depPolicy.dependency === undefined || depPolicy.expected === undefined) {
                    policy = depPolicy.policy;
                    break;
                }

                if (args[depPolicy.dependency] === depPolicy.expected) {
                    policy = depPolicy.policy;
                    break;
                }

                // we are at last index and we did not find a matcing policy, add a default policy at the end
                if (i === argumentPolicy.length - 1) {
                    let depPolicy = Object.create(null);
                    depPolicy.policy = policy;
                    argumentPolicy[i + 1] = depPolicy;
                    this.Parent.Invalidate();

                }
            }
        } else {
            policy = argumentPolicy;
        }

        return new ContextifyEntityPolicy(this.Policy, this.Parent, policy, `${this.Path}[${index}]`);
    }

    get Result(): IDecontextifyEntityPolicy {
        if (this.Data.result === undefined) {
            this.Data.result = Object.create(null) as object;
            this.Parent.Invalidate();
        }

        return new DecontextifyEntityPolicy(this.Policy, this.Parent, this.Data.result, this.Path);
    }
}

// ---

export class DecontextifyCallPolicy extends DecontextifyCCPolicyBase implements IDecontextifyCallPolicy {

    constructor(policy: IPolicy, parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy, data: CallPolicyData, path: string) {
        super(policy, parent, data, path);
    }

    get Allow(): (thisArg: any, ...args: any[]) => boolean {
        if (this.Data.allow === undefined) {
            this.Data.allow = this.Parent.GetDecontextifyDefault(Action.Call, this.Path);
            this.Parent.Invalidate();
        }

        let fun: (...args: any[]) => boolean;
        if (typeof this.Data.allow === "string") {
            fun = eval(this.Data.allow);
            if (!(fun instanceof Function)) {
                throw new PolicyError(`Function guards must be functions, got ${fun}`);
            }
        } else {
            fun = () => !!this.Data.allow;
        }

        let self = this;

        let reporter = function (thisArg: any, ...args: any[]): boolean {
            let result;
            if (thisArg === undefined) {
                result = fun(...args);
            } else {
                result = fun(thisArg, ...args);
            }

            if (!result) {
                self.Policy.ReportViolation(`Decontextify call action on path ${self.Path} denied.`);
            }
            return result;
        }

        return reporter;
    }
}

// ---

export class DecontextifyConstructPolicy extends DecontextifyCCPolicyBase implements IDecontextifyConstructPolicy {

    constructor(policy: IPolicy, parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy, data: CallPolicyData, path: string) {
        super(policy, parent, data, path);
    }

    get Allow(): (...args: any[]) => boolean {
        if (this.Data.allow === undefined) {
            this.Data.allow = this.Parent.GetDecontextifyDefault(Action.Construct, this.Path);
            this.Parent.Invalidate();
        }

        let fun: (...args: any[]) => boolean;
        if (typeof this.Data.allow === "string") {
            fun = eval(this.Data.allow);
            if (!(fun instanceof Function)) {
                throw new PolicyError(`Function guards must be functions, got ${fun}`);
            }
        } else {
            fun = () => !!this.Data.allow;
        }

        let self = this;

        let reporter = function (...args: any[]): boolean {
            let result = fun(...args);
            if (!result) {
                self.Policy.ReportViolation(`Decontextify construct action on path ${self.Path} denied.`);
            }
            return result;
        }
        return reporter;
    }

}

// ---

export class DecontextifyEntityPolicy implements IDecontextifyEntityPolicy {

    Policy: IPolicy;
    Parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy | null;

    Path: string;

    Data: EntityPolicyData;
    Properties: { [key: string]: DecontextifyPropertyPolicy } = Object.create(null);

    constructor(policy: IPolicy, parent: IContextifyEntityPolicy | IDecontextifyEntityPolicy | null, data: EntityPolicyData | string, path: string) {
        this.Policy = policy;
        this.Parent = parent;

        this.Path = path;
        this.Data = this.Resolve(data);
    }

    get Override(): Override {
        if (this.Data.override === "expose") {
            return Override.Expose;
        }

        if (this.Data.override === "protect") {
            return Override.Protect;
        }

        return Override.None
    }

    GetProperty(key: PropertyKey): DecontextifyPropertyPolicy {
        let sKey = String(key);

        if (this.Properties[String(sKey)] === undefined) {
            let modified = false;
            if (!this.Data.properties) {
                this.Data.properties = Object.create(null) as { [key: string]: PropertyPolicyData };
                modified = true;
            }

            if (!this.Data.properties[sKey]) {
                this.Data.properties[sKey] = Object.create(null);
                modified = true;
            }

            this.Properties[sKey] = new DecontextifyPropertyPolicy(this.Policy, this, this.Data.properties[sKey], `${this.Path}/${sKey}`);

            if (modified) {
                this.Invalidate();
            }
        }

        return this.Properties[sKey];
    }



    get Call(): IDecontextifyCallPolicy {
        if (this.Data.call === undefined) {
            this.Data.call = Object.create(null) as object;
            this.Invalidate();
        }

        return new DecontextifyCallPolicy(this.Policy, this, this.Data.call, this.Path);
    }



    get Construct(): IDecontextifyConstructPolicy {
        if (this.Data.construct === undefined) {
            this.Data.construct = Object.create(null) as object;
            this.Invalidate();
        }

        return new DecontextifyConstructPolicy(this.Policy, this, this.Data.construct, this.Path);
    }

    Resolve(data: EntityPolicyData | string): EntityPolicyData {
        if (typeof data !== "string") {
            return data;
        }

        let dPolicy = this.Policy.GetEntityPolicyData(data);
        if (dPolicy === undefined) {
            dPolicy = { type: "decontextify" };

            this.Policy.SetEntityPolicyData(this.Path, dPolicy);
            this.Policy.RegisterInManifest(this.Path, dPolicy);
        }
        return dPolicy;
    }

    Invalidate() {
        if (!this.Data.options || !!this.Data.options.learn) {
            this.Policy.Invalidate();
        }
    }

    GetContextifyDefault(action: Action, path: string): boolean {
        if (this.Data.options !== undefined) {
            return GetContextifyDefault(this.Data.options, action, path);
        }

        if (this.Parent !== null) {
            return this.Parent.GetContextifyDefault(action, path);
        }

        return this.Policy.GetContextifyDefault(action, path);
    }

    GetDecontextifyDefault(action: Action, path: string): boolean {
        if (this.Data.options !== undefined) {
            return GetDecontextifyDefault(this.Data.options, action, path);
        }

        if (this.Parent !== null) {
            return this.Parent.GetDecontextifyDefault(action, path);
        }

        return this.Policy.GetDecontextifyDefault(action, path);
    }

}


// ---

let defaults: PolicyDefaults = {
    interactive: false,
    learn: true,

    contextify: {
        read: false,
        write: false,
        call: false,
        construct: false
    },

    decontextify: {
        read: false,
        write: false,
        call: false,
        construct: false
    }
}

// ---

class PolicyError extends Error {
    constructor(...args: any[]) {
        super(...args);
    }
}

// ---

function ActionString(action: Action): string {
    switch (action) {
        case Action.Read: return "read";
        case Action.Write: return "write";
        case Action.Call: return "call";
        case Action.Construct: return "construct";
    }

    return "Pope!";
}

// --- 

function YesNo(msg: string, def: boolean): boolean {

    let result = "Pope!";
    let yn = def ? "(Y/n)" : "(y/N)";
    while (result !== "y" && result !== "Y" && result !== "n" && result !== "N") {
        result = readline.question(`${msg} ${yn}`);
        if (result === "") {
            result = def ? "Y" : "N";
        }
    }

    return result === "y" || result === "Y";
}

// ---

function GetContextifyDefault(options: PolicyDefaults, action: Action, path: string): boolean {

    let def = false;
    switch (action) {
        case Action.Read:
            def = !!options.contextify?.read;
            break;
        case Action.Write:
            def = !!options.contextify?.write;
            break;
        case Action.Call:
            def = !!options.contextify?.call;
            break;
        case Action.Construct:
            def = !!options.contextify?.construct;
            break;
    }

    // in learning mode, ask to use default if interactive, otherwise allow
    if (!!options.learn) {
        if (!!options.interactive) {
            return YesNo(`Allow decontextify ${ActionString(action)} action on path ${path}?`, def);
        }
        return true;
    }

    return def;
}

// ---

function GetDecontextifyDefault(options: PolicyDefaults, action: Action, path: string): boolean {


    let def = false;
    switch (action) {
        case Action.Read:
            def = !!options.decontextify?.read;
            break;
        case Action.Write:
            def = !!options.decontextify?.write;
            break;
        case Action.Call:
            def = !!options.decontextify?.call;
            break;
        case Action.Construct:
            def = !!options.decontextify?.construct;
            break;
    }

    // in learning mode, ask to use default if interactive, otherwise allow
    if (!!options.learn) {
        if (!!options.interactive) {
            return YesNo(`Allow decontextify ${ActionString(action)} action on path ${path}?`, def);
        }
        return true;
    }

    return def;
}

// ---

export class PolicyParamters implements IPolicyParameters {

    Data: PolicyParameterData;

    constructor(data?: PolicyParameterData) {
        if (data !== undefined) {
            this.Data = data;
        } else {
            this.Data = {};
        }
    }

    Get(id: string): string {
        if (this.Data[id] === undefined) {
            throw new SandTrapError(`Policy parameter ${id} is undefined`);
        }
        return this.Data[id];
    }

}

// ---

export class Policy implements IPolicy {
    Root: string;
    Name: string;
    Data: PolicyData;

    EntityPolicyData: EntityPolicyDataMap;
    Parameters: PolicyParamters;

    WriteDelay: number;
    Id: number;

    constructor(root: string, name: string, parameters?: PolicyParameterData) {
        this.EntityPolicyData = {};

        this.Root = root;
        this.Name = name;
        this.Parameters = new PolicyParamters(parameters);

        this.Data = {
            options: defaults,
            onerror: "warn",
            global: "global",
            manifest: {}
        };

        this.Id = Math.floor(Math.random() * 2 ** 32);


        this.WriteDelay = 50;

        this.LoadPolicy();
    }

    // policy behavior

    get Throw(): boolean {
        return this.Data.onerror === "throw";
    }

    get Warn(): boolean {
        return this.Data.onerror === "warn";
    }

    get Silent(): boolean {
        return this.Data.onerror === "silent";
    }


    // ---

    GetContextifyDefault(action: Action, path: string): boolean {
        return GetContextifyDefault(this.Data.options, action, path);
    }


    GetDecontextifyDefault(action: Action, path: string): boolean {
        return GetDecontextifyDefault(this.Data.options, action, path);
    }

    // policies

    get Global(): IContextifyEntityPolicy {
        return new ContextifyEntityPolicy(this, null, this.Data.global, "global");
    }

    // ---

    Require(id: string): IContextifyEntityPolicy | undefined {
        // undefined means the module is refused
        if (!this.Data.options.learn && this.EntityPolicyData[id] === undefined) {
            return undefined;
        }

        let cPolicy = this.GetEntityPolicyData(id);
        if (cPolicy === undefined) {
            cPolicy = { type: "contextify" };
            this.SetEntityPolicyData(id, cPolicy);
            if (!this.Data.options || !!this.Data.options.learn) {
                this.RegisterInManifest(id);
            }
        }
        return new ContextifyEntityPolicy(this, null, cPolicy, id);
    }

    // ---

    GetContextifyEntityPolicy(path: string): IContextifyEntityPolicy {
        let id = path;
        let cPolicy = this.GetEntityPolicyData(id);
        if (cPolicy === undefined) {
            cPolicy = { type: "contextify" };
            this.SetEntityPolicyData(id, cPolicy);
            if (!this.Data.options || !!this.Data.options.learn) {
                this.RegisterInManifest(id);
            }
        }
        return new ContextifyEntityPolicy(this, null, cPolicy, path);
    }

    GetDecontextifyEntityPolicy(path: string): IDecontextifyEntityPolicy {
        let id = path;
        let dPolicy = this.GetEntityPolicyData(path);
        if (dPolicy === undefined) {
            dPolicy = { type: "decontextify" };
            this.SetEntityPolicyData(id, dPolicy);
            if (!this.Data.options || !!this.Data.options.learn) {
                this.RegisterInManifest(id);
            }
        }
        return new DecontextifyEntityPolicy(this, null, dPolicy, path);
    }

    // ---

    static IdToPath(id: string) {
        return `${id}.json`;
    }

    // --- 

    LoadPolicy(): void {

        let policyFile = path.join(this.Root, Policy.IdToPath(this.Name));

        try {

            if (fs.existsSync(policyFile)) {
                this.Data = JSON.parse(fs.readFileSync(policyFile, "utf8"));
            } else {
                this.Invalidate();
            }


            for (let id in this.Data.manifest) {
                let policyFile = path.join(this.Root, this.Data.manifest[id]);
                try {
                    let data = JSON.parse(fs.readFileSync(policyFile, "utf8")) as EntityPolicyData;
                    this.EntityPolicyData[id] = data;
                } catch (e) {
                    throw new SandTrapError(`Unable to load ${policyFile} from the manifest, ${e.message}`);
                }
            }

        } catch (e) {
            throw new SandTrapError(`Unable to load ${policyFile}, ${e.message}`);
        }

    }

    Invalidated: boolean = false;
    DiskActivity: Promise<void> | null = null;

    // the somewhat complex busy-waiting is needed since node.js does not
    // wait for promises to finish before exiting.
    Invalidate(): void {
        if (this.Invalidated) {
            return;
        }

        console.log(`[${this.Id}] Disk policies invalidated; write to disk scheduled in ${this.WriteDelay} ms.`);

        this.Invalidated = true;
        let self = this;
        setTimeout(() => {
            self.WriteToDisk();
            console.log(`[${this.Id}] Done writing updated policies to disk.`);
            self.Invalidated = false;
        }, this.WriteDelay
        )


        /*

        this.Invalidated = true;



        if (this.DiskActivity !== null) {
            return;
        }

        let self = this;
        function InitiateWriteToDiskAndWait() {

            // disk activity removes itself when done
            if (self.DiskActivity === null && self.Invalidated) {
                self.DiskActivity = self.WriteToDisk();
                self.Invalidated = false;
            }

            // there is still activity
            if (self.DiskActivity !== null) {
                setTimeout(InitiateWriteToDiskAndWait, 50);
            }
        }
        InitiateWriteToDiskAndWait();*/
    }

    WriteToDisk(): Promise<void> | null {
        let policyfile = path.join(this.Root, Policy.IdToPath(this.Name));
        let policyfilepath = path.dirname(policyfile);
        fs.mkdirSync(policyfilepath, { recursive: true });
        fs.writeFileSync(policyfile, beautify(this.Data), "utf8");

        for (let id in this.Data.manifest) {
            let filename = path.join(this.Root, this.Data.manifest[id]);
            let filepath = path.dirname(filename);
            let data = this.GetEntityPolicyData(id);
            fs.mkdirSync(filepath, { recursive: true });
            fs.writeFileSync(filename, beautify(data), "utf8");
        }

        return null;

        /*
        let policyFile = path.join(this.Root, Policy.IdToPath(this.Name));
        let barrier = [fs.promises.writeFile(policyFile, beautify(this.Data), "utf8")]

        for (let id in this.Data.manifest) {
            let filename = path.join(this.Root, this.Data.manifest[id]);
            let filepath = path.dirname(filename);
            let data = this.GetEntityPolicyData(id);
            let p =
                fs.promises.mkdir(filepath, { recursive: true }).
                    then(() => fs.promises.writeFile(filename, beautify(data), "utf8")).
                    then(() => console.log(`Wrote ${filename}`));
            barrier.push(p);
        }

        let self = this;
        return Promise.all(barrier).
            then(() => { self.DiskActivity = null; }).
            catch(e => { throw new SandTrapError(`Unable to write to disk ${e}`); });*/
    }


    RegisterInManifest(id: string): void {
        let filename = path.join(this.Root, Policy.IdToPath(id));
        this.Data.manifest[id] = path.relative(this.Root, filename);
        this.Invalidate();
    }

    SetEntityPolicyData(id: string, policy: EntityPolicyData): void {
        this.EntityPolicyData[id] = policy;
    }

    GetEntityPolicyData(id: string): EntityPolicyData | undefined {
        let data = this.EntityPolicyData[id];
        return data;
    }

    // ---

    ReportViolation(msg: string): void {

        if (this.Silent) {
            return;
        }

        if (this.Warn) {
            console.log(msg);
            return;
        }

        throw new SandTrapError(msg);

    }


}