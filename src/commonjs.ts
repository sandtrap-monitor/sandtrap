
/*
*  This file is executed in the contexts of the sandbox and must be defensively coded.
*  It assumes that the context is populated with fresh primordials.
*  It has access the the primordials of the host, in order to be able to make sure those
*  don't escape into the context, and that internal primordials don't escape out.
*/

(function CommonJSFunctor(
    this: Global,
    host: NodeJS.Global & typeof globalThis,
    vmContext: NodeJS.Global, // not the right type
    SandTrapError: new (name?: string) => Error,
    require: NodeRequire,
    policy: IPolicy,
    Contextify: IContextify,
    Decontextify: IDecontextify
): {
    SandTrapModule: SandTrapModuleConstructor,
    makeRequireFunction: Function
} {
    // needs acces to require, need access to Contextify and Decontextify
    // needs access to policy 
    // policy an 'id' lvl? only for natives?
    let path = require("path");
    let NodeJSModule = require("module");
    let fs = require("fs");
    let { Script } = require("vm");

    // the class is what is exported by "module"
    class SandTrapModule {
        id: string;
        path: string;
        exports: any;
        parent: SandTrapModule | null;
        filename: string | null;
        loaded: boolean;
        children: SandTrapModule[];
        paths: string[];

        constructor(id: string, parent: SandTrapModule) {
            // how to hide policy? pass it in for the entire context and then use the path
            this.id = id;
            this.path = path.dirname(id);
            this.exports = {};
            this.filename = null;
            this.loaded = false;
            this.children = [];
            this.parent = parent;
            this.paths = [];
        }

        // using a default read policy to be able to access all
        static builtinModules: string[] = [...NodeJSModule.builtinModules];
        static _cache: NodeJS.Dict<SandTrapModule> = Object.create(null);
        static _extensions = Object.create(null);
        static _load(request: string, parent: SandTrapModule, isMain: boolean): object {

            let filename = SandTrapModule._resolveFilename(request, parent, false);

            if (SandTrapModule._cache[filename] !== undefined) {
                // @ts-ignore, TS doesn't see it is not undefined
                return SandTrapModule._cache[filename].exports;
            }

            if (SandTrapModule.builtinModules.includes(filename)) {
                try {
                    let modulePolicy = policy.Require(filename);
                    if (!modulePolicy) {
                        if (!modulePolicy) {
                            if (policy.Throw) {
                                throw new SandTrapError(`Policy forbids requiring ${filename}`);
                            }

                            if (policy.Warn) {
                                host.console.log(`Policy forbids requiring ${filename}`)
                            }

                            return {};
                        }
                    }

                    let builtin = require(filename);
                    return Contextify(builtin, filename, modulePolicy);
                }
                catch (e) {
                    // TODO: default policy for exceptions
                    throw Contextify(e, "commonjs._load.exception");
                }
            }

            let module = new SandTrapModule(filename, parent);
            SandTrapModule._cache[filename] = module;

            module.load(filename);
            return module.exports;
        }

        static _resolveFilename(id: string, parent: SandTrapModule, isMain: boolean): string {
            let filename;

            let paths = [];
            if (parent !== null) {
                paths.push(parent.path);
            }

            /*
            * This require is the require of SandTrap and will search this directory
            * We want to search the directory of the parent. 
            * TODO: check how require actually searches and add potentially more things here.
            */

            try {
                filename = require.resolve(id, { paths: paths });
            } catch (e) {
                throw Contextify(e, "commonjs._resolveFilename.exception");
            }
            return filename;
        }

        load(filename: string): void {
            let ext = path.extname(filename);
            SandTrapModule._extensions[ext](this, filename);
            this.loaded = true;
        }

        require(id: string): object {
            return SandTrapModule._load(id, this, false);
        }

        _compile(content: string, filename: string) {
            const dirname = path.dirname(filename);
            const require = makeRequireFunction(this);
            const exports = this.exports;
            const thisValue = exports;
            const module = this;

            let re = /^#!.*$/gm;
            re.exec(content);

            if (re.lastIndex > 0) {
                content = content.substring(re.lastIndex);
            }

            // TODO: options to make code run in strict mode
            const code = `(function (exports, require, module, __filename, __dirname) { ${content} \n});`;

            let script;
            try {
                script = new Script(code, { filename: filename });
            } catch (e) {
                // TODO: default policy for exceptions
                throw Contextify(e, "commonjs._compile.exception");
            }

            // OBSERVE!
            // runInThisContext runs in the context of the (vm/initiator?)
            // its the host context regardless, see experiments/vm-nested-scripts.js 
            // thus, we must pass the actual context - we cannot use this, since
            // it is not a proper context objec, i.e., it's not the right type, see experiments/vm-this-global.js
            let functor = script.runInContext(vmContext);
            let result = functor.call(thisValue, exports, require, module, filename, dirname);
            return result;
        }

    }

    // TODO: how to handle the filenames in the policy; we should compute something
    SandTrapModule._extensions[".node"] = function (module: SandTrapModule, filename: string): void {
        let modulePolicy = policy.Require(filename);

        if (modulePolicy === undefined) {
            if (policy.Throw) {
                throw new SandTrapError(`Policy forbids requiring ${filename}`);
            }

            if (policy.Warn) {
                host.console.log(`Policy forbids requiring ${filename}`)
            }

            return;
        }
        try {
            let builtin = require(filename);
            module.exports = Contextify(builtin, filename, modulePolicy);
        } catch (e) {
            // TODO: default policy for exceptions
            throw Contextify(e, "commonjs._extensions.node.exception");
        }
    }

    SandTrapModule._extensions[".json"] = function (module: SandTrapModule, filename: string): void {
        let modulePolicy = policy.Require(filename);

        // if there is a module policy load the source file using the host require
        if (modulePolicy !== undefined) {
            return SandTrapModule._extensions[".node"](module, filename);
        }

        // else load it as a local module
        try {
            let content = fs.readFileSync(filename, 'utf8');
            module.exports = JSON.parse(content);
        } catch (e) {
            // TODO: default policy for exceptions
            throw Contextify(e, "commonjs._extensions.json.exception");
        }
    }

    SandTrapModule._extensions[".js"] = function (module: SandTrapModule, filename: string): void {
        try {
            let content = fs.readFileSync(filename, 'utf8');
            module._compile(content, filename);
        } catch (e) {
            // TODO: default policy for exceptions
            throw Contextify(e, "commonjs._extensions.json.exception");
        }
    }

    // ---

    function makeRequireFunction(module: SandTrapModule): Function {
        let require = function require(path: string) {
            return module.require(path);
        };

        function resolve(request: string) {
            return SandTrapModule._resolveFilename(request, module, false);
        }

        //@ts-ignore
        require.resolve = resolve;
        //@ts-ignore
        require.extensions = SandTrapModule._extensions;

        return require;
    }

    // ---

    return {
        SandTrapModule,
        makeRequireFunction
    }
})