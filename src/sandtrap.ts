import * as vm from "vm";
import * as fs from "fs";
import * as path from "path";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import { couldStartTrivia } from "typescript";

export class SandTrap {

    Context: any;

    Contextify: IContextify;
    Decontextify: IDecontextify;

    Module: any;
    MakeRequireFunction: Function;

    Policy: IPolicy;
    Root : string;

    constructor(policy: IPolicy, root?: string) {
        this.Policy = policy;
        this.Root = this.ComputeRoot(root);

        let vmContext = vm.createContext({}, { codeGeneration: { strings: false, wasm: false} });

        // load the contextification functions
        let contextification = fs.readFileSync(path.join(__dirname, "contextification.js"), "utf8");
        let ctxScript = new vm.Script(contextification, { filename: "contextification.js" });
        let ctxFunctor: ContextificationFunctor = ctxScript.runInContext(vmContext);

        let {
            Contextify,
            Decontextify
        } = ctxFunctor(global, SandTrapError, this.Policy);

        this.Context = vmContext;
        this.Contextify = Contextify;
        this.Decontextify = Decontextify;

        this.SetupNodeJSContext();

        let commonjs = fs.readFileSync(path.join(__dirname, "commonjs.js"), "utf8");
        let cjsScript = new vm.Script(commonjs, { filename: "commonjs.js" });
        let cjsFunctor: CommonJSFunctor = cjsScript.runInContext(vmContext);

        let {
            SandTrapModule,
            makeRequireFunction
        } = cjsFunctor(global, vmContext, SandTrapError, require, this.Policy, Contextify, Decontextify);

        this.Module = SandTrapModule;
        this.MakeRequireFunction = makeRequireFunction;

        let _this = this;
        let _eval = function _eval(code : string) {
            code = String(code);
            if (!_this.Verify(code)) {
                throw new SandTrapError("Unsupported instructions");
            }

            let script = new vm.Script(code);
            let result = script.runInContext(_this.Context);
            return result;
        }

        this.ContextifyObject(_eval, "eval");
    }

    // ---

    ComputeRoot(root? : string) : string {
        if (root != undefined) {
            return root;
        }
        //@ts-ignore
        return module.parent.parent.path;
    }

    // ---

    Verify(code : string) : boolean {
        //@ts-ignore
        let ast = acorn.parse(code, { ecmaVersion : "2020" });
        var danger = false;

        //@ts-ignore
        walk.simple(ast, {
            ImportExpression(node) {
                danger = true;
            },
            ImportDeclaration(node) {
                danger = true;
            }
          })
          return !danger;
    }

    Eval(code: string, policyName: string): any {
        if (!this.Verify(code)) {
            throw new SandTrapError("Unsupported instructions");
        }
        if (policyName === undefined) {
            policyName = "SandTrap.Eval";
        }

        let script = new vm.Script(code);
        let policy = this.Policy.GetDecontextifyEntityPolicy(policyName);
        let result;
        try {
            result = script.runInContext(this.Context);
        } catch (e) {
            throw e;
        }
        return this.Decontextify(result, "SandTrap.Eval", policy)

    }

    // ---

    Load(filename: string): any {
        let code = fs.readFileSync(filename, "utf8");
        let policyName = filename;
        if (policyName.indexOf(this.Root) === 0) {
            policyName = policyName.slice(this.Root.length);
        }
        return this.Eval(code, policyName);
    }

    // --

    EvalAsModule(code: string, policyName: string, filename? : string): any {
        if (!this.Verify(code)) {
            throw new SandTrapError("Unsupported instructions");
        }

        if (policyName === undefined) {
            policyName = "SandTrap.EvalAsModule";
        }
        let policy = this.Policy.GetDecontextifyEntityPolicy(policyName);

        let _module = new this.Module("EvalInModule", null);
        const require = this.MakeRequireFunction(_module);
        const exports = _module.exports;
        const thisValue = exports;

        let moduleCode : string;
        if (filename === undefined) {
            moduleCode = `(function (exports, require, module) { ${code} \n});`;
        } else {
            moduleCode = `(function (exports, require, module, __filename, __dirname) { ${code} \n});`;
        }

        let script = new vm.Script(moduleCode, { filename: "SandTrap.EvalInModule" });

        let functor = script.runInContext(this.Context);
        let result;
        try {
            if (filename === undefined) {
            result = functor.call(thisValue, exports, require, _module);
            } else {
                let dirname = path.dirname(filename);
                result = functor.call(thisValue, exports, require, _module, filename, dirname);

            }
        } catch (e) {
            throw this.Decontextify(e, "SandTrap.EvalInModule.exception");
        }

        return this.Decontextify(_module.exports, policyName, policy);
    }

    // ---

    LoadAsModule(filename: string): any {
        let code = fs.readFileSync(filename, "utf8");
        let policyName = filename;
        if (policyName.indexOf(this.Root) === 0) {
            policyName = policyName.slice(this.Root.length);
        }
        return this.EvalAsModule(code, policyName, filename);
    }

    // ---

    private SetupNodeJSContext() {
        // inherit and contextify the nodejs global object  
        this.ContextifyGlobalProperty("Buffer");
        this.ContextifyGlobalProperty("clearImmediate");
        this.ContextifyGlobalProperty("clearInterval");
        this.ContextifyGlobalProperty("clearTimeout");
        this.ContextifyGlobalProperty("console");
        this.ContextifyGlobalProperty("process");

        // do not take strings as arguments
        this.ContextifyGlobalProperty("queueMicrotask");
        this.ContextifyGlobalProperty("setImmediate");
        this.ContextifyGlobalProperty("setInterval");
        this.ContextifyGlobalProperty("setTimeout");
    }

    ContextifyGlobalProperty(p: string): void {
        let desc = Reflect.getOwnPropertyDescriptor(global, p);

        if (desc === undefined) {
            throw new SandTrapError(`SandTrap: ${p} not defined on global object.`)
        }

        let propPolicy = this.Policy.Global.GetProperty(p);
        let cDesc = this.Contextify.Descriptor(desc, p, propPolicy.ReadPolicy, propPolicy.getOwnPropertyDescriptorPolicy);
        Reflect.defineProperty(this.Context, p, cDesc);
    }

    ContextifyObject(o: object, name: string): void {
        let policy = this.Policy.GetContextifyEntityPolicy(name);
        let cO = this.Contextify(o, name, policy);
        this.Context[name] = cO;
    }
}


/*
function EnsureSandboxExecution(program: string | Function, context: object): Function {
    if (typeof program === "string") {
        let script = new vm.Script(program);
        return (() => {
            return script.runInContext(context);
        });
    }

    return program;
}

function HardenEvallike(evallike: Function, context: object): Function {
    return ((program: string | Function, ...args: any[]) => {
        let hardenedFunction = EnsureSandboxExecution(program, context);
        return evallike(hardenedFunction, ...args);
    });
}
*/

export class SandTrapError extends Error {
    constructor(message?: string) {
        super(message);
    }
}



