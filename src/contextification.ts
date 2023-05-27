/*
*  This file is executed in the contexts of the sandbox and must be defensively coded.
*  It assumes that the context is populated with fresh primordials.
*  It has access the the primordials of the host, in order to be able to make sure those
*  don't escape into the context, and that internal primordials don't escape out.
*
*  Uses the original object as the proxy target now, which I hope is fine. Otherwise, we have
*  to swtich, which requires populating the target using the actual enitity.
*/

//@ts-ignore
global = this;

(function ContextificationFunctor(
    host: NodeJS.Global & typeof globalThis,
    SandTrapError: new (name?: string) => Error,
    Policy: IPolicy
): {
    Decontextify: IDecontextify,
    Contextify: IContextify
} {
    let VERBOSE_DEBUG = false;
    let POLICY_DEBUG = false;
    let DEBUG = false;

    let debugIndent = 0;

    function Debug(...args: any[]): void {
        if (DEBUG) {
            host.console.log(' '.repeat(debugIndent), ...args);
        }
    }

    function DebugBegin(...args: any[]): void {
        if (DEBUG) {
            host.console.log(' '.repeat(debugIndent), ...args);
        }
        debugIndent += 2;
    }

    function DebugEnd(...args: any[]): void {
        debugIndent -= 2;

        if (DEBUG) {
            host.console.log(' '.repeat(debugIndent), ...args);
        }

    }

    let _Object = {
        assign : Object.assign.bind(Object),
        create : Object.create.bind(Object)
    }


    /* Maps box -> host
    *   - box prim -> host prim
    *   - box -> Decon(box)
    *   - Con(host) -> host
    */

    let Decontextified = new host.WeakMap();

    /* Maps host -> box
    *   - host prim -> box prim
    *   - host -> Con(host)
    *   - Decon(box) -> box
    */

    let Contextified = new host.WeakMap();


    let DecontextifyHandler: {
        object: (entity: any, path: string, policy: IDecontextifyEntityPolicy) => ProxyHandler<Object>,
        function: (entity: any, path: string, polciy: IDecontextifyEntityPolicy) => ProxyHandler<Function>,
    } = host.Object.create(null);

    let ContextifyHandler: {
        object: (entity: any, path: string, policy: IContextifyEntityPolicy) => ProxyHandler<Object>,
        function: (entity: any, path: string, policy: IContextifyEntityPolicy) => ProxyHandler<Function>,
    } = host.Object.create(null);

    //@ts-ignore, descriptor is defined further down
    let Decontextify: IDecontextify = function Decontextify(boxEntity: any, path: string, policy?: IDecontextifyEntityPolicy): any {
        VERBOSE_DEBUG && DebugBegin("Decontextify BEGIN", path);

        if (boxEntity === null) {
            return boxEntity;
        }

        if (
            typeof boxEntity === "boolean" ||
            typeof boxEntity === "number" ||
            typeof boxEntity === "bigint" ||
            typeof boxEntity === "string" ||
            typeof boxEntity === "symbol" ||
            typeof boxEntity === "undefined"
        ) {
            VERBOSE_DEBUG && DebugEnd("Decontextify END, primitive value", path);
            return boxEntity;
        }

        if (policy && policy.Override === Override.Expose) {
            VERBOSE_DEBUG && DebugEnd("Decontextify retaining", path);
            return boxEntity;
        }

        if (Decontextified.has(boxEntity) && !(policy && policy.Override === Override.Protect)) {
            VERBOSE_DEBUG && DebugEnd("Decontextify, got a hit in the cache", path);
            return Decontextified.get(boxEntity);
        }

        if (DEBUG && VERBOSE_DEBUG) {
            if (host.Reflect.getOwnPropertyDescriptor(boxEntity, "__decontextified")) {
                throw new Error("Decontextify, got decontextified object!");
            }
        }

        if (DEBUG && VERBOSE_DEBUG) {
            if (host.Reflect.getOwnPropertyDescriptor(boxEntity, "__contextified")) {
                throw new Error(`Decontextify, got contextified object that was not in the weak map: ${boxEntity}`);
            }
        }

        VERBOSE_DEBUG && Debug("Decontextify, object or function", path);

        policy = policy !== undefined ? policy : Policy.GetDecontextifyEntityPolicy(path);

        let handler: ProxyHandler<object>;
        let mime;
        if (boxEntity instanceof Function) {
            handler = DecontextifyHandler.function(boxEntity, path, policy);
            mime = new host.Function();
        } else if (boxEntity instanceof String) {
            handler = DecontextifyHandler.object(boxEntity, path, policy);
            mime = new host.String();//host.Object.create(null);
        } else if (boxEntity instanceof Number) {
            handler = DecontextifyHandler.object(boxEntity, path, policy);
            mime = new host.Number();//host.Object.create(null);
        } else if (boxEntity instanceof Boolean) {
            handler = DecontextifyHandler.object(boxEntity, path, policy);
            mime = new host.Boolean();//host.Object.create(null);
        } else if (boxEntity instanceof Array) {
            handler = DecontextifyHandler.object(boxEntity, path, policy);
            mime = new host.Array();//host.Object.create(null);
        } else if (boxEntity instanceof Date) {
            handler = DecontextifyHandler.object(boxEntity, path, policy);
            mime = new host.Date();//host.Object.create(null);
        } else if (boxEntity instanceof Error) {
            handler = DecontextifyHandler.object(boxEntity, path, policy);
            mime = new host.Error();//host.Object.create(null);
        } else {
            handler = DecontextifyHandler.object(boxEntity, path, policy);
            mime = new host.Object();//host.Object.create(null);
        }

        let hostEntity = new host.Proxy(mime, handler);
        Decontextified.set(boxEntity, hostEntity);
        Contextified.set(hostEntity, boxEntity);
        VERBOSE_DEBUG && DebugEnd("Decontextify END", path);

        return hostEntity;
    };

    Decontextify.Descriptor = function <T extends PropertyDescriptor>(boxDescriptor: T, path: string, valuePolicy: IDecontextifyEntityPolicy, gettersetterPolicy: IDecontextifyGetterSetterPolicy): T {
        VERBOSE_DEBUG && DebugBegin("Decontextify.Descriptor BEGIN", path);

        // copy over the values into a local object
        let hostDescriptor = host.Object.assign(new host.Object(), boxDescriptor);

        if (boxDescriptor.value) {
            hostDescriptor.value = Decontextify(boxDescriptor.value, path, valuePolicy);
            VERBOSE_DEBUG && DebugEnd("Decontextify.Descriptor END", path);
            return hostDescriptor;
        }

        if (boxDescriptor.get) {
            hostDescriptor.get = Decontextify(boxDescriptor.get, `${path}.get`, gettersetterPolicy.Get);
        }

        if (boxDescriptor.set) {
            hostDescriptor.set = Decontextify(boxDescriptor.set, `${path}.set`, gettersetterPolicy.Set);
        }

        VERBOSE_DEBUG && DebugEnd("Decontextify.Descriptor END", path);

        return hostDescriptor;
    };

    Decontextify.Arguments = function (boxArgs: ArrayLike<any>, path: string = "unknown", policy: IContextifyCallPolicy): ArrayLike<any> {
        VERBOSE_DEBUG && DebugBegin("Decontextify.Arguments BEGIN", path);

        let hostArgs = new host.Array();
        for (let i = 0; i < boxArgs.length; i++) {
            hostArgs[i] = Decontextify(boxArgs[i], `${path}[${i}]`, policy.Arguments(i, boxArgs))
        }

        VERBOSE_DEBUG && DebugEnd("Decontextify.Arguments END", path);

        return hostArgs;
    };


    //@ts-ignore, descriptor is defined further down
    let Contextify: IContextify = function Contextify(hostEntity: any, path: string = "unknown", policy?: IContextifyEntityPolicy): any {
        VERBOSE_DEBUG && DebugBegin("Contextify BEGIN", path);

        if (hostEntity === null) {
            return hostEntity;
        }

        if (
            typeof hostEntity === "boolean" ||
            typeof hostEntity === "number" ||
            typeof hostEntity === "bigint" ||
            typeof hostEntity === "string" ||
            typeof hostEntity === "symbol" ||
            typeof hostEntity === "undefined"
        ) {
            VERBOSE_DEBUG && DebugEnd("Contextify END, primitive value", path);
            return hostEntity;
        }

        if (policy && policy.Override === Override.Expose) {
            VERBOSE_DEBUG && DebugEnd("Contextify retaining", path);
            return hostEntity;
        }

        if (Contextified.has(hostEntity) && !(policy && policy.Override === Override.Protect)) {
            VERBOSE_DEBUG && DebugEnd("Contextify, got a hit in the cache", path);
            return Contextified.get(hostEntity);
        }

        if (DEBUG && VERBOSE_DEBUG) {
            if (host.Reflect.getOwnPropertyDescriptor(hostEntity, "__contextified")) {
                throw new Error("Contextify, got contextified object!");
            }
        }

        if (DEBUG && VERBOSE_DEBUG) {
            if (host.Reflect.getOwnPropertyDescriptor(hostEntity, "__decontextified")) {
                throw new Error("Contextify, got decontextified object that was not in the weak map");
            }
        }

        VERBOSE_DEBUG && Debug("Contextify, object or function", path);

        policy = policy !== undefined ? policy : Policy.GetContextifyEntityPolicy(path);


        let handler: ProxyHandler<object>;
        let mime;

        if (hostEntity instanceof host.Function || typeof hostEntity === "function") {
            handler = ContextifyHandler.function(hostEntity, path, policy);
            mime = function () { };
        } else if (hostEntity instanceof host.String) {
            handler = ContextifyHandler.object(hostEntity, path, policy);
            mime = new String();
        } else if (hostEntity instanceof host.Number) {
            handler = ContextifyHandler.object(hostEntity, path, policy);
            mime = new Number();
        } else if (hostEntity instanceof host.Boolean) {
            handler = ContextifyHandler.object(hostEntity, path, policy);
            mime = new Boolean();
        } else if (hostEntity instanceof host.Array) {
            handler = ContextifyHandler.object(hostEntity, path, policy);
            mime = new Array();
        } else if (hostEntity instanceof host.Date) {
            handler = ContextifyHandler.object(hostEntity, path, policy);
            mime = new Date();
        } else if (hostEntity instanceof host.Error) {
            handler = ContextifyHandler.object(hostEntity, path, policy);
            mime = new Error();
        } else {
            handler = ContextifyHandler.object(hostEntity, path, policy);
            mime = new Object();
        }


        let boxEntity = new host.Proxy(mime, handler);
        Contextified.set(hostEntity, boxEntity);
        Decontextified.set(boxEntity, hostEntity);
        VERBOSE_DEBUG && DebugEnd("Contextify END", path, "gives", mime);

        return boxEntity;
    };

    Contextify.Descriptor = function <T extends PropertyDescriptor>(hostDescriptor: T, path: string, valuePolicy: IContextifyEntityPolicy, gettersetterPolicy: IContextifyGetterSetterPolicy): T {
        VERBOSE_DEBUG && DebugBegin("Contextify.Descriptor BEGIN", path);

        // copy over the values into a local object
        let boxDescriptor = _Object.assign({}, hostDescriptor);


        if (hostDescriptor.value) {
            boxDescriptor.value = Contextify(hostDescriptor.value, path, valuePolicy);
            VERBOSE_DEBUG && DebugEnd("Contextify.Descriptor END", path);

            return boxDescriptor;
        }


        if (hostDescriptor.get) {
            boxDescriptor.get = Contextify(hostDescriptor.get, `${path}.get`, gettersetterPolicy.Get);
        }


        if (hostDescriptor.set) {
            boxDescriptor.set = Contextify(hostDescriptor.set, `${path}.set`, gettersetterPolicy.Set);
        }

        VERBOSE_DEBUG && DebugEnd("Contextify.Descriptor END", path);

        return boxDescriptor;
    };

    Contextify.Arguments = function (hostArgs: ArrayLike<any>, path: string = "unknown", policy: IDecontextifyCallPolicy): ArrayLike<any> {
        VERBOSE_DEBUG && DebugBegin("Contextify.Arguments BEGIN", path);

        let boxArgs = [];
        for (let i = 0; i < hostArgs.length; i++) {
            boxArgs[i] = Contextify(hostArgs[i], `${path}[${i}]`, policy.Arguments(i, hostArgs))
        }

        VERBOSE_DEBUG && DebugEnd("Contextify.Arguments END", path);

        return boxArgs;
    };

    // ---


    function SyncAndDecontextifyOwnProperty(
        boxEntity: object,
        hostMime: object,
        p: PropertyKey,
        path: string,
        policy: IDecontextifyEntityPolicy): boolean {
        VERBOSE_DEBUG && DebugBegin("SyncAndDecontextifyOwnProperty BEGIN", p, path)

        let boxDescriptor = host.Reflect.getOwnPropertyDescriptor(boxEntity, p);

        if (boxDescriptor === undefined) {
            VERBOSE_DEBUG && DebugEnd("SyncAndDecontextifyOwnProperty END", p, path)
            return true;
        }

        let propPolicy = policy.GetProperty(p);

        POLICY_DEBUG && Debug(`Decontextify policy for getOwnPropertyDescriptor of ${host.String(p)} on ${path} gives ${propPolicy.Read}`);

        if (!propPolicy.Read) {
            VERBOSE_DEBUG && DebugEnd("SyncAndContextifyOwnProperty END", p, path, "READ REFUSED");
            return false;
        }

        let hostDescriptor = Decontextify.Descriptor(boxDescriptor, `${path}.${host.String(p)}`, propPolicy.ReadPolicy, propPolicy.getOwnPropertyDescriptorPolicy);
        let hostResult = host.Reflect.defineProperty(hostMime, p, hostDescriptor);

        VERBOSE_DEBUG && DebugEnd("SyncAndDecontextifyOwnProperty END", p, path)
        return hostResult;
    }

    function SyncAndDecontextifyPrototype(
        boxEntity: object,
        hostMime: object,
        path: string,
        policy: IDecontextifyEntityPolicy): boolean {
        VERBOSE_DEBUG && DebugBegin("SyncAndDecontextifyPrototype BEGIN", path)

        let boxProto = host.Reflect.getPrototypeOf(boxEntity);

        if (boxProto === null) {
            let result = host.Reflect.setPrototypeOf(hostMime, null);
            VERBOSE_DEBUG && DebugEnd("SyncAndDecontextifyPrototype END", path)
            return result;
        }

        let propPolicy = policy.GetProperty("__proto__");

        POLICY_DEBUG && Debug(`Decontextify policy for getPrototypeOf on ${path} gives ${propPolicy.Read}`);

        if (!propPolicy.Read) {
            VERBOSE_DEBUG && DebugEnd("SyncAndContextifyPrototype END", path, "READ REFUSED");
            return false;
        }

        let hostProto = Decontextify(boxProto, `${path}.__proto__`, propPolicy.ReadPolicy);
        let hostResult = host.Reflect.setPrototypeOf(hostMime, hostProto);

        VERBOSE_DEBUG && DebugEnd("SyncAndDecontextifyPrototype END", path)
        return hostResult;
    }




    DecontextifyHandler.object = (boxEntity: any, path: string, policy: IDecontextifyEntityPolicy) => {

        /*
        If the following invariants are violated, the proxy will throw a TypeError:
    
        getPrototypeOf() method must return an object or null.
        If target is not extensible, Object.getPrototypeOf(proxy) method must return the same value as Object.getPrototypeOf(target).
        */
        return {

            getPrototypeOf: function getPrototypeOf(hostMime: object): object | null {
                VERBOSE_DEBUG && DebugBegin("Decontextify.getPrototypeOf BEGIN");

                SyncAndDecontextifyPrototype(boxEntity, hostMime, path, policy);
                let hostProto = host.Reflect.getPrototypeOf(hostMime);

                VERBOSE_DEBUG && DebugEnd("Decontextify.getPrototypeOf END");
                return hostProto !== undefined ? hostProto : null;
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            If target is not extensible, the prototype parameter must be the same value as Object.getPrototypeOf(target).
            */

            setPrototypeOf: function setPrototypeOf(hostMime: object, hostProto: any): boolean {
                VERBOSE_DEBUG && DebugBegin("Decontextify.setPrototypeOf BEGIN");

                let protoPolicy = policy.GetProperty("__proto__");
                POLICY_DEBUG && Debug(`Decontextify policy for setPrototypeOf on ${path} gives ${protoPolicy.Write}`);

                if (!protoPolicy.Write) {
                    return false;
                }

                let boxProto = Contextify(hostProto, `${path}.__proto__`, protoPolicy.WritePolicy);
                let success = host.Reflect.setPrototypeOf(boxEntity, boxProto);

                VERBOSE_DEBUG && DebugEnd("Decontextify.setPrototypeOf END");
                return success;
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            Object.isExtensible(proxy) must return the same value as Object.isExtensible(target).
            */

            // We do not want to prevent extensions on the mime, just because the host prevents extensions
            // since the mime is lazily populated. See preventExtension below

            isExtensible: function isExtensible(hostMime: object): boolean {
                VERBOSE_DEBUG && Debug("Decontextify.isExtensible BEGIN/END");

                return true;
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            Object.preventExtensions(proxy) only returns true if Object.isExtensible(proxy) is false.   
            */

            // We don't want to prevent extension on the mime, since it is lazily populated
            // TODO: if this causes crashes we have to implement a way to fully populate mimes of objects
            // that cannot be extended.

            preventExtensions: function preventExtensions(hostMime: object): boolean {
                VERBOSE_DEBUG && Debug("Decontextify.preventExtension BEGIN/END");

                return false;
            },
            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            getOwnPropertyDescriptor() must return an object or undefined.
            A property cannot be reported as non-existent, if it exists as a non-configurable own property of the target object.
            A property cannot be reported as non-existent, if it exists as an own property of the target object and the target object is not extensible.
            A property cannot be reported as existent, if it does not exists as an own property of the target object and the target object is not extensible.
            A property cannot be reported as non-configurable, if it does not exists as an own property of the target object or if it exists as a configurable own property of the target object.
            The result of Object.getOwnPropertyDescriptor(target) can be applied to the target object using Object.defineProperty() and will not throw an exception.
            */

            getOwnPropertyDescriptor: function getOwnPropertyDescriptor(hostMime: object, p: PropertyKey): PropertyDescriptor | undefined {
                VERBOSE_DEBUG && DebugBegin("Decontextify.getOwnPropertyDescriptor BEGIN", p);

                SyncAndDecontextifyOwnProperty(boxEntity, hostMime, p, path, policy);
                let hostDescriptor = host.Reflect.getOwnPropertyDescriptor(hostMime, p);

                VERBOSE_DEBUG && DebugEnd("Decontextify.getOwnPropertyDescriptor END", p);
                return hostDescriptor;
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            A property cannot be reported as non-existent, if it exists as a non-configurable own property of the target object.
            A property cannot be reported as non-existent, if it exists as an own property of the target object and the target object is not extensible.
            */

            has: function has(hostMime: object, p: PropertyKey): boolean {
                VERBOSE_DEBUG && DebugBegin("Decontextify.has BEGIN", p);

                SyncAndDecontextifyOwnProperty(boxEntity, hostMime, p, path, policy);
                SyncAndDecontextifyPrototype(boxEntity, hostMime, path, policy);

                // since the prototype of target is decontextified, the prototype chain should be recursively 

                let hostResult = host.Reflect.has(hostMime, p);

                VERBOSE_DEBUG && DebugEnd("Decontextify.has END", p);
                return hostResult;
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            The value reported for a property must be the same as the value of the corresponding target object property if the target object property is a non-writable, non-configurable own data property.
            The value reported for a property must be undefined if the corresponding target object property is a non-configurable own accessor property that has undefined as its [[Get]] attribute.
            */

            get: function get(hostMime: object, p: PropertyKey, hostReceiver: any): any {
                VERBOSE_DEBUG && DebugBegin("Decontextify.get BEGIN", p);

                SyncAndDecontextifyOwnProperty(boxEntity, hostMime, p, path, policy);
                SyncAndDecontextifyPrototype(boxEntity, hostMime, path, policy);

                let hostValue = host.Reflect.get(hostMime, p, hostReceiver);

                VERBOSE_DEBUG && DebugEnd("Decontextify.get END", p);

                return hostValue;
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            Cannot change the value of a property to be different from the value of the corresponding target object property if the corresponding target object property is a non-writable, non-configurable data property.
            Cannot set the value of a property if the corresponding target object property is a non-configurable accessor property that has undefined as its [[Set]] attribute.
            In strict mode, a false return value from the set() handler will throw a TypeError exception.
            */

            // hostReceiver is the this of a setter
            // we come here if the hostMine does not have the value, but has a DecontextifyProxy on its prototype chain
            // since the proxy may be hiding a setter

            set: function set(hostMime: object, p: PropertyKey, hostValue: any, hostReceiver: any): boolean {
                VERBOSE_DEBUG && DebugBegin("Decontextify.set BEGIN", p);

                SyncAndDecontextifyOwnProperty(boxEntity, hostMime, p, path, policy);
                SyncAndDecontextifyPrototype(boxEntity, hostMime, path, policy);

                if (hostMime !== hostReceiver) {
                    // hostMime is a proxy on the prototype chain of hostReceiver, 
                    // hostReceiver must be a hostObject,
                    // since it is not a proxy.

                    let mimeHas = host.Reflect.has(hostMime, p);
                    let hostDecriptor = host.Reflect.getOwnPropertyDescriptor(hostMime, p) as PropertyDescriptor;

                    // if there is a property p reachable from boxEntity/hostMime 
                    if (mimeHas && hostDecriptor === undefined) {
                        // p is not local, but may occur further down
                        host.Reflect.set(hostMime, p, hostValue, hostReceiver);
                        return true;
                    }

                    // if boxEntity contains a setter, so does hostMime, but that one is lifted already to the host

                    if (hostDecriptor !== undefined && hostDecriptor.set !== undefined) {
                        // boxEntity/hostMime contains a setter for p
                        // the setter will in that case do all the conversions
                        hostDecriptor.set.call(hostReceiver, hostValue);
                        return true;
                    }

                    if (hostDecriptor !== undefined && hostDecriptor.get !== undefined) {
                        // accessor property that hides all other updates
                        return true;
                    }

                    // it seems for arrays it is possible that the lenght property
                    // puts us in a place where boxReceiver acutally has the property
                    // and then we can change the descriptor. 
                    // we handle this by checking if it it actually there and then change only
                    // the value

                    let hostReceiverDescriptor = host.Reflect.getOwnPropertyDescriptor(hostReceiver, p) as PropertyDescriptor;

                    if (hostReceiverDescriptor === undefined) {
                        hostReceiverDescriptor = {
                            writable: true,
                            enumerable: true,
                            configurable: true
                        }
                    }

                    hostReceiverDescriptor.value = hostValue;

                    VERBOSE_DEBUG && Debug("Decontextify.set DEFINING ON RECEIVER");
                    host.Reflect.defineProperty(hostReceiver, p, hostReceiverDescriptor);
                    return true;

                }

                // the hostMime and boxEntity are the same

                let propPolicy = policy.GetProperty(p);
                let boxValue = Contextify(hostValue, `${path}.${host.String(p)}`, propPolicy.WritePolicy);

                POLICY_DEBUG && Debug(`Decontextify policy for set of ${host.String(p)} on ${path} gives ${propPolicy.Write}`);

                if (!propPolicy.Write) {
                    return false;
                }

                host.Reflect.set(boxEntity, p, boxValue);

                //@ts-ignore
                VERBOSE_DEBUG && DebugEnd("Decontextify.set END", p);
                return true;
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            A property cannot be deleted, if it exists as a non-configurable own property of the target object.
            */

            deleteProperty: function deleteProperty(hostMime: object, p: PropertyKey): boolean {
                VERBOSE_DEBUG && DebugBegin("Decontextify.deleteProperty BEGIN", p);

                let propPolicy = policy.GetProperty(p);
                POLICY_DEBUG && Debug(`Decontextify policy for delete of ${host.String(p)} on ${path} gives ${propPolicy.Write}`);

                if (!propPolicy.Write) {
                    return false;
                }

                let success = host.Reflect.deleteProperty(boxEntity, p);

                VERBOSE_DEBUG && DebugEnd("Decontextify.deleteProperty END", p);
                return success;
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            A property cannot be added, if the target object is not extensible.
            A property cannot be added as or modified to be non-configurable, if it does not exists as a non-configurable own property of the target object.
            A property may not be non-configurable, if a corresponding configurable property of the target object exists.
            If a property has a corresponding target object property then Object.defineProperty(target, prop, descriptor) will not throw an exception.
            In strict mode, a false return value from the defineProperty() handler will throw a TypeError exception.    
            */

            defineProperty: function defineProperty(hostMime: object, p: PropertyKey, hostDescriptor: PropertyDescriptor): boolean {
                VERBOSE_DEBUG && DebugBegin("Decontextify.defineProperty BEGIN", p);

                SyncAndDecontextifyOwnProperty(boxEntity, hostMime, p, path, policy);

                let propPolicy = policy.GetProperty(p);
                POLICY_DEBUG && Debug(`Decontextify policy for defineProperty of ${host.String(p)} on ${path} gives ${propPolicy.Read}`);

                if (!propPolicy.Write) {
                    return false;
                }

                let boxDescriptor = Contextify.Descriptor(hostDescriptor, `${path}.${host.String(p)}`, propPolicy.WritePolicy, propPolicy.definePropertyDescriptor);
                host.Reflect.defineProperty(boxEntity, p, boxDescriptor);

                VERBOSE_DEBUG && DebugEnd("Decontextify.defineProperty END", p);
                return true;
            },

            /* DEPRECATED in ES2016 
            enumerate (target: object): PropertyKey[] {
            }
            */

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            The result of ownKeys() must be an array.
            The type of each array element is either a String or a Symbol.
            The result List must contain the keys of all non-configurable own properties of the target object.
            If the target object is not extensible, then the result List must contain all the keys of the own properties of the target object and no other values.
            */


            ownKeys: function ownKeys(hostMime: object): PropertyKey[] {
                VERBOSE_DEBUG && DebugBegin("Decontextify.ownKeys BEGIN");

                let boxKeys = host.Reflect.ownKeys(boxEntity);
                for (let index in boxKeys) {
                    SyncAndDecontextifyOwnProperty(boxEntity, hostMime, boxKeys[index], path, policy);
                }
                let hostKeys = host.Reflect.ownKeys(hostMime);

                //@ts-ignore
                VERBOSE_DEBUG && DebugEnd("Decontextify.ownKeys END");
                return hostKeys;
            }
        }
    };


    DecontextifyHandler.function = (boxFunction: Function, path: string, policy: IDecontextifyEntityPolicy) => {

        return {
            ...DecontextifyHandler.object(boxFunction, path, policy),

            /* 
            If the following invariants are violated, the proxy will throw a TypeError.
        
            The target must be a callable itself. That is, it must be a function object.
            */
            apply(hostMime: Function, hostThisArg: any, hostArgArray?: any): any {
                VERBOSE_DEBUG && DebugBegin("Decontextify.apply BEGIN");

                let callPolicy = policy.Call;

                let allow = false;
                try {
                    allow = callPolicy.Allow(hostThisArg, ...hostArgArray);
                } catch (e) {
                    throw new SandTrapError(`Policy Error: function guard resulted in ${e.message}`);
                }

                POLICY_DEBUG && Debug(`Decontextify policy for call on ${path} gives ${allow}`);

                if (!allow) {
                    return;
                }

                let boxThisArg = Contextify(hostThisArg, path, callPolicy.ThisArg);

                if (hostArgArray === undefined) {
                    hostArgArray = new host.Array();
                }

                let boxArgArray = Contextify.Arguments(hostArgArray, path, callPolicy);

                try {
                    let boxResult = host.Reflect.apply(boxFunction, boxThisArg, boxArgArray);
                    let hostResult = Decontextify(boxResult, path, callPolicy.Result);

                    VERBOSE_DEBUG && DebugEnd("Decontextify.apply END");
                    return hostResult;
                } catch (boxException) {
                    VERBOSE_DEBUG && DebugEnd("Decontextify.apply EXCEPTION");
                    if (boxException instanceof SandTrapError) {
                        // SandTrapError is a host class
                        throw boxException;
                    }

                    throw Decontextify(boxException, path);
                }
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            The result must be an Object.
            */
            construct(hostMime: Function, hostArgArray: any, hostNewTarget?: any): object {
                //@ts-ignore
                VERBOSE_DEBUG && DebugBegin("Decontextify.construct BEGIN");

                let constructPolicy = policy.Construct;

                let allow = false;
                try {
                    allow = constructPolicy.Allow(...hostArgArray);
                } catch (e) {
                    throw new SandTrapError(`Policy Error: construct guard resulted in ${e.message}`);
                }

                POLICY_DEBUG && Debug(`Decontextify policy for call on ${path} gives ${allow}`);

                if (!allow) {
                    return {};
                }

                if (hostArgArray === undefined) {
                    hostArgArray = new host.Array();
                }

                let boxArgArray = Contextify.Arguments(hostArgArray, path, constructPolicy);
                // TODO: piggybacking on thisArg
                let boxNewTarget = Contextify(hostNewTarget, path, constructPolicy.ThisArg);

                try {
                    let boxResult = host.Reflect.construct(boxFunction, boxArgArray, boxNewTarget);
                    let hostResult = Decontextify(boxResult, path, constructPolicy.Result);

                    VERBOSE_DEBUG && DebugEnd("Decontextify.construct END");
                    return hostResult;
                } catch (boxException) {
                    VERBOSE_DEBUG && DebugEnd("Decontextify.construct EXCEPTION");
                    if (boxException instanceof SandTrapError) {
                        // SandTrapError is a host class
                        throw boxException;
                    }
                    throw Decontextify(boxException, path);
                }
            }
        }
    };


    // ---

    function MaybeSyncAndContextifyOwnProperty(
        hostEntity: object,
        boxMime: object,
        p: PropertyKey,
        path: string,
        policy: IContextifyEntityPolicy): boolean {

        VERBOSE_DEBUG && DebugBegin("MaybeSyncAndContextifyOwnProperty BEGIN", p, path);

        let hostDescriptor = host.Reflect.getOwnPropertyDescriptor(hostEntity, p);

        if (hostDescriptor === undefined) {
            VERBOSE_DEBUG && DebugEnd("MaybeSyncAndContextifyOwnProperty END", p, path, "NO SUCH PROPERTY");
            return true;
        }


        let propPolicy = policy.GetProperty(p);
        POLICY_DEBUG && Debug(`Contextify pr getOwnPropertyDescriptor of ${host.String(p)} on ${path} gives ${propPolicy.Read}`);


        if (!propPolicy.Read) {
            VERBOSE_DEBUG && DebugEnd("MaybeSyncAndContextifyOwnProperty END", p, path, "READ REFUSED");
            return false;
        }



        let boxDescriptor = Contextify.Descriptor(hostDescriptor, `${path}.${host.String(p)}`, propPolicy.ReadPolicy, propPolicy.getOwnPropertyDescriptorPolicy);

        let boxResult = host.Reflect.defineProperty(boxMime, p, boxDescriptor);

        VERBOSE_DEBUG && DebugEnd("MaybeSyncAndContextifyOwnProperty END", p, path);
        return boxResult;
    }

    function MaybeSyncAndContextifyPrototype(
        hostEntity: object,
        boxMime: object,
        path: string,
        policy: IContextifyEntityPolicy): boolean {

        VERBOSE_DEBUG && DebugBegin("MaybeSyncAndContextifyPrototype BEGIN", path);

        let hostProto = host.Reflect.getPrototypeOf(hostEntity);

        if (hostProto === null) {
            let result = host.Reflect.setPrototypeOf(boxMime, null);
            VERBOSE_DEBUG && DebugEnd("MaybeSyncAndContextifyPrototype END", path);
            return result;
        }

        let propPolicy = policy.GetProperty("__proto__");
        POLICY_DEBUG && Debug(`Contextify pr getPrototypeOf on ${path} gives ${propPolicy.Read}`);


        if (!propPolicy.Read) {
            VERBOSE_DEBUG && DebugEnd("MaybeSyncAndContextifyPrototype END", path, "READ REFUSED");
            return false;
        }


        let boxProto = Contextify(hostProto, `${path}.__proto__`, propPolicy.ReadPolicy);
        let boxResult = host.Reflect.setPrototypeOf(boxMime, boxProto);

        VERBOSE_DEBUG && DebugEnd("MaybeSyncAndContextifyPrototype END", path);
        return boxResult;

    }

    ///

    ContextifyHandler.object = (hostEntity: any, path: string, policy: IContextifyEntityPolicy) => {

        // TODO: perhaps cache the hostValue to see if we need to invalidate local modifications
        let locallyDefined = _Object.create(null);
        let localProto = false;

        return {
            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            getPrototypeOf() method must return an object or null.
            If target is not extensible, Object.getPrototypeOf(proxy) method must return the same value as Object.getPrototypeOf(target).
            */


            getPrototypeOf: function getPrototypeOf(boxMime: object): object | null {
                try {
                    VERBOSE_DEBUG && DebugBegin("Contextify.getPrototypeOf BEGIN");

                    if (localProto !== true) {
                        MaybeSyncAndContextifyPrototype(hostEntity, boxMime, path, policy);
                    }
                    let boxProto = host.Reflect.getPrototypeOf(boxMime);

                    VERBOSE_DEBUG && DebugEnd("Contextify.getPrototypeOf END");

                    return boxProto !== undefined ? boxProto : null;
                } catch (he) {
                    let be;
                    try {
                        be = Contextify(he, "Contextify.object.getProtorypeOf");
                    } catch (e) {
                        throw new Error("Contextify.object.getProtorypeOf, Internal Error");
                    }
                    throw be;
                }
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            If target is not extensible, the prototype parameter must be the same value as Object.getPrototypeOf(target).
            */

            setPrototypeOf: function setPrototypeOf(boxMime: object, boxProto: any): boolean {
                try {
                    VERBOSE_DEBUG && DebugBegin("Contextify.setPrototypeOf BEGIN");

                    let protoPolicy = policy.GetProperty("__proto__");
                    POLICY_DEBUG && Debug(`Contextify pr setPrototypeOf on ${path} gives ${protoPolicy.Write}`);

                    if (!protoPolicy.Write) {
                        localProto = true;
                        let success = host.Reflect.setPrototypeOf(boxMime, boxProto);
                        return success;
                    }

                    let hostProto = Decontextify(boxProto, `${path}.__proto__`, protoPolicy.WritePolicy);
                    let success = host.Reflect.setPrototypeOf(hostEntity, hostProto);

                    VERBOSE_DEBUG && DebugEnd("Contextify.setPrototypeOf END");
                    return success;
                } catch (he) {
                    let be;
                    try {
                        be = Contextify(he, "Contextify.object.setPrototypeOf");
                    } catch (e) {
                        throw new Error("Contextify.object.setPrototypeOf, Internal Error");
                    }
                    throw be;
                }

            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            Object.isExtensible(proxy) must return the same value as Object.isExtensible(target).
            */

            isExtensible: function isExtensible(target: object): boolean {
                //@ts-ignore
                VERBOSE_DEBUG && Debug("Contextify.isExtensible BEGIN/END");

                return true;
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            Object.preventExtensions(proxy) only returns true if Object.isExtensible(proxy) is false.   
            */

            preventExtensions: function preventExtensions(target: object): boolean {
                VERBOSE_DEBUG && Debug("Contextify.preventExtensions BEGIN/END");

                return false;
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            getOwnPropertyDescriptor() must return an object or undefined.
            A property cannot be reported as non-existent, if it exists as a non-configurable own property of the target object.
            A property cannot be reported as non-existent, if it exists as an own property of the target object and the target object is not extensible.
            A property cannot be reported as existent, if it does not exists as an own property of the target object and the target object is not extensible.
            A property cannot be reported as non-configurable, if it does not exists as an own property of the target object or if it exists as a configurable own property of the target object.
            The result of Object.getOwnPropertyDescriptor(target) can be applied to the target object using Object.defineProperty() and will not throw an exception.
            */

            getOwnPropertyDescriptor: function getOwnPropertyDescriptor(boxMime: object, p: PropertyKey): PropertyDescriptor | undefined {
                try {
                    VERBOSE_DEBUG && DebugBegin("Contextify.getOwnPropertyDescriptor BEGIN", p);

                    if (locallyDefined[p] !== true) {
                        MaybeSyncAndContextifyOwnProperty(hostEntity, boxMime, p, path, policy);
                    }
                    let boxDescriptor = host.Reflect.getOwnPropertyDescriptor(boxMime, p);

                    VERBOSE_DEBUG && DebugEnd("Contextify.getOwnPropertyDescriptor END", p);
                    return boxDescriptor;
                } catch (he) {
                    let be;
                    try {
                        be = Contextify(he, "Contextify.object.getOwnPropertyDescriptor");
                    } catch (e) {
                        throw new Error("Contextify.object.getOwnPropertyDescriptor, Internal Error");
                    }
                    throw be;
                }
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            A property cannot be reported as non-existent, if it exists as a non-configurable own property of the target object.
            A property cannot be reported as non-existent, if it exists as an own property of the target object and the target object is not extensible.
            */

            has: function has(boxMime: object, p: PropertyKey): boolean {
                try {
                    VERBOSE_DEBUG && DebugBegin("Contextify.has BEGIN", p);

                    if (locallyDefined[p] !== true) {
                        MaybeSyncAndContextifyOwnProperty(hostEntity, boxMime, p, path, policy);
                    }
                    if (localProto !== true) {
                        MaybeSyncAndContextifyPrototype(hostEntity, boxMime, path, policy);
                    }

                    let boxResult = host.Reflect.has(boxMime, p);

                    VERBOSE_DEBUG && DebugEnd("Contextify.has END", p);
                    return boxResult;
                } catch (he) {
                    let be;
                    try {
                        be = Contextify(he, "Contextify.object.has");
                    } catch (e) {
                        throw new Error("Contextify.object.has, Internal Error");
                    }
                    throw be;
                }
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            The value reported for a property must be the same as the value of the corresponding target object property if the target object property is a non-writable, non-configurable own data property.
            The value reported for a property must be undefined if the corresponding target object property is a non-configurable own accessor property that has undefined as its [[Get]] attribute.
            */

            get: function get(boxMime: object, p: PropertyKey, boxReceiverceiver: any): any {
                try {
                    VERBOSE_DEBUG && DebugBegin("Contextify.get BEGIN", p);

                    if (p == "Pope!") {
                        Debug("Is contextify proxy, contains host entity");
                        return true;
                    }


                    if (locallyDefined[p] !== true) {
                        MaybeSyncAndContextifyOwnProperty(hostEntity, boxMime, p, path, policy);
                    }

                    if (localProto !== true) {
                        MaybeSyncAndContextifyPrototype(hostEntity, boxMime, path, policy);
                    }


                    let boxValue = host.Reflect.get(boxMime, p, boxReceiverceiver);


                    VERBOSE_DEBUG && DebugEnd("Contextify.get END");

                    return boxValue;
                } catch (he) {
                    let be;
                    try {
                        be = Contextify(he, "Contextify.object.get");
                    } catch (e) {
                        throw new Error("Contextify.object.get, Internal Error");
                    }
                    throw be;
                }
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            Cannot change the value of a property to be different from the value of the corresponding target object property if the corresponding target object property is a non-writable, non-configurable data property.
            Cannot set the value of a property if the corresponding target object property is a non-configurable accessor property that has undefined as its [[Set]] attribute.
            In strict mode, a false return value from the set() handler will throw a TypeError exception.
            */

            set: function set(boxMime: object, p: PropertyKey, boxValue: any, boxReceiver: any): boolean {
                try {
                    VERBOSE_DEBUG && DebugBegin("Contextify.set BEGIN", p);

                    if (locallyDefined[p] !== true) {
                        MaybeSyncAndContextifyOwnProperty(hostEntity, boxMime, p, path, policy);
                    }
                    if (localProto !== true) {
                        MaybeSyncAndContextifyPrototype(hostEntity, boxMime, path, policy);
                    }

                    if (boxMime !== boxReceiver) {

                        let mimeHas = host.Reflect.has(boxMime, p);
                        let boxDecriptor = host.Reflect.getOwnPropertyDescriptor(boxMime, p) as PropertyDescriptor;

                        if (mimeHas && boxDecriptor === undefined) {
                            // p is not local, but may occur further down
                            host.Reflect.set(boxMime, p, boxValue, boxReceiver);
                            return true;
                        }

                        // if boxEntity contains a setter, so does hostMime, but that one is lifted already to the host

                        if (boxDecriptor !== undefined && boxDecriptor.set !== undefined) {
                            // boxEntity/hostMime contains a setter for p
                            // the setter will in that case do all the conversions
                            boxDecriptor.set.call(boxReceiver, boxValue);
                            return true;
                        }

                        if (boxDecriptor !== undefined && boxDecriptor.get !== undefined) {
                            // accessor property that hides all other updates
                            return true;
                        }

                        // it seems for arrays it is possible that the lenght property
                        // puts us in a place where boxReceiver acutally has the property
                        // and then we can change the descriptor. 
                        // we handle this by checking if it it actually there and then change only
                        // the value

                        let boxReceiverDescriptor = host.Reflect.getOwnPropertyDescriptor(boxReceiver, p) as PropertyDescriptor;

                        if (boxReceiverDescriptor === undefined) {
                            boxReceiverDescriptor = {
                                writable: true,
                                enumerable: true,
                                configurable: true
                            }
                        }

                        boxReceiverDescriptor.value = boxValue;

                        VERBOSE_DEBUG && Debug("Contextify.set DEFINING ON RECEIVER");
                        host.Reflect.defineProperty(boxReceiver, p, boxReceiverDescriptor);
                        return true;

                    }

                    let propPolicy = policy.GetProperty(p);
                    let hostValue = Decontextify(boxValue, `${path}.${host.String(p)}`, propPolicy.WritePolicy);

                    POLICY_DEBUG && Debug(`Contextify pr set of ${host.String(p)} on ${path} gives ${propPolicy.Write}`);

                    if (!propPolicy.Write) {
                        host.Reflect.set(boxMime, p, boxValue);
                        locallyDefined[p] = true;
                        return true;
                    }

                    host.Reflect.set(hostEntity, p, hostValue);

                    VERBOSE_DEBUG && DebugEnd("Contextify.set END", p);
                    return true;
                } catch (he) {
                    let be;
                    try {
                        be = Contextify(he, "Contextify.object.set");
                    } catch (e) {
                        throw new Error("Contextify.object.set, Internal Error");
                    }
                    throw be;
                }

            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            A property cannot be deleted, if it exists as a non-configurable own property of the target object.
            */

            deleteProperty: function deleteProperty(target: object, p: PropertyKey): boolean {
                try {
                    VERBOSE_DEBUG && DebugBegin("Contextify.deleteProperty BEGIN", p);

                    let propPolicy = policy.GetProperty(p);
                    POLICY_DEBUG && Debug(`Contextify pr delete of ${host.String(p)} on ${path} gives ${propPolicy.Write}`);

                    // We cannot delete read only properties unless we extend the model
                    if (!propPolicy.Write) {
                        return false;
                    }

                    if (locallyDefined[p] === true) {
                        host.Reflect.deleteProperty(target, p);
                        locallyDefined[p] = false;
                    }
                    let success = host.Reflect.deleteProperty(hostEntity, p);

                    VERBOSE_DEBUG && DebugEnd("Contextify.deleteProperty END", p);
                    return success;
                } catch (he) {
                    let be;
                    try {
                        be = Contextify(he, "Contextify.object.deleteProperty");
                    } catch (e) {
                        throw new Error("Contextify.object.deleteProperty, Internal Error");
                    }
                    throw be;
                }
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            A property cannot be added, if the target object is not extensible.
            A property cannot be added as or modified to be non-configurable, if it does not exists as a non-configurable own property of the target object.
            A property may not be non-configurable, if a corresponding configurable property of the target object exists.
            If a property has a corresponding target object property then Object.defineProperty(target, prop, descriptor) will not throw an exception.
            In strict mode, a false return value from the defineProperty() handler will throw a TypeError exception.    
            */

            defineProperty: function defineProperty(boxMime: object, p: PropertyKey, boxDescriptor: PropertyDescriptor): boolean {
                try {
                    VERBOSE_DEBUG && DebugBegin("Contextify.defineProperty BEGIN", p);

                    if (locallyDefined[p] !== true) {
                        MaybeSyncAndContextifyOwnProperty(hostEntity, boxMime, p, path, policy);
                    }

                    let propPolicy = policy.GetProperty(p);
                    POLICY_DEBUG && Debug(`Contextify pr defineProperty of ${host.String(p)} on ${path} gives ${propPolicy.Read}`);

                    if (!propPolicy.Write) {
                        host.Reflect.defineProperty(boxMime, p, boxDescriptor);
                        locallyDefined[p] = true;
                        return true;
                    }

                    let hostDescriptor = Decontextify.Descriptor(boxDescriptor, `${path}.${host.String(p)}`, propPolicy.WritePolicy, propPolicy.definePropertyDescriptor);
                    host.Reflect.defineProperty(hostEntity, p, hostDescriptor);

                    VERBOSE_DEBUG && DebugEnd("Contextify.defineProperty END", p);
                    return true;
                } catch (he) {
                    let be;
                    try {
                        be = Contextify(he, "Contextify.object.defineProperty");
                    } catch (e) {
                        throw new Error("Contextify.object.defineProperty, Internal Error");
                    }
                    throw be;
                }
            },

            /* DEPRECATED in ES2016 
            enumerate (target: object): PropertyKey[] {
            }
            */

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            The result of ownKeys() must be an array.
            The type of each array element is either a String or a Symbol.
            The result List must contain the keys of all non-configurable own properties of the target object.
            If the target object is not extensible, then the result List must contain all the keys of the own properties of the target object and no other values.
            */

            ownKeys: function ownKeys(boxMime: object): PropertyKey[] {
                try {
                    VERBOSE_DEBUG && DebugBegin("Contextify.ownKeys BEGIN");

                    let hostKeys = host.Reflect.ownKeys(hostEntity);
                    for (let index in hostKeys) {
                        if (locallyDefined[hostKeys[index]] !== true) {
                            MaybeSyncAndContextifyOwnProperty(hostEntity, boxMime, hostKeys[index], path, policy);
                        }
                    }
                    let boxKeys = host.Reflect.ownKeys(boxMime);
                    VERBOSE_DEBUG && DebugEnd("Contextify.ownKeys END");
                    return boxKeys;
                } catch (he) {
                    let be;
                    try {
                        be = Contextify(he, "Contextify.object.ownKeys");
                    } catch (e) {
                        throw new Error("Contextify.object.ownKeys, Internal Error");
                    }
                    throw be;
                }
            }
        }
    };


    ContextifyHandler.function = (hostFunction: Function, path: string, policy: IContextifyEntityPolicy) => {


        return {
            ...ContextifyHandler.object(hostFunction, path, policy),

            /* 
            If the following invariants are violated, the proxy will throw a TypeError.
        
            The target must be a callable itself. That is, it must be a function object.
            */
            apply(boxMime: Function, boxThisArg: any, boxArgArray?: any): any {
                try {
                    VERBOSE_DEBUG && DebugBegin("Contextify.apply BEGIN");

                    let callPolicy = policy.Call;

                    let allow = false;
                    try {
                        allow = callPolicy.Allow(boxThisArg, ...boxArgArray);
                    } catch (e) {
                        throw new SandTrapError(`Policy Error: function guard resulted in ${e.message}`);
                    }

                    POLICY_DEBUG && Debug(`Contextify pr call on ${path} gives ${allow}`);

                    if (!allow) {
                        return;
                    }

                    let hostThisArg = Decontextify(boxThisArg, path);

                    if (boxArgArray === undefined) {
                        boxArgArray = [];
                    }

                    let hostArgArray = Decontextify.Arguments(boxArgArray, path, callPolicy);

                    let hostResult = host.Reflect.apply(hostFunction, hostThisArg, hostArgArray);
                    let boxResult = Contextify(hostResult, path, callPolicy.Result);

                    VERBOSE_DEBUG && DebugEnd("Contextify.apply END");
                    return boxResult;
                } catch (he) {
                    let be;
                    try {
                        be = Contextify(he, "Contextify.function.apply");
                    } catch (e) {
                        throw new Error("Contextify.function.apply, Internal Error");
                    }
                    throw be;
                }
            },

            /*
            If the following invariants are violated, the proxy will throw a TypeError:
        
            The result must be an Object.
            */
            construct(boxMime: Function, boxArgArray: any, boxNewTarget?: any): object {
                try {
                    VERBOSE_DEBUG && DebugBegin("Contextify.construct BEGIN");


                    let constructPolicy = policy.Construct;

                    let allow = false;
                    try {
                        allow = constructPolicy.Allow(...boxArgArray);
                    } catch (e) {
                        throw new SandTrapError(`Policy Error: construct guard resulted in ${e.message}`);
                    }

                    POLICY_DEBUG && Debug(`Contextify pr call on ${path} gives ${allow}`);

                    if (!allow) {
                        return {};
                    }

                    if (boxArgArray === undefined) {
                        boxArgArray = [];
                    }

                    let hostArgArray = Decontextify.Arguments(boxArgArray, path, constructPolicy);

                    // TODO: piggybacking on thisArg
                    let hostNewTarget = Decontextify(boxNewTarget, path, constructPolicy.ThisArg);

                    let hostResult = host.Reflect.construct(hostFunction, hostArgArray, hostNewTarget);
                    let boxResult = Contextify(hostResult, path, constructPolicy.Result);

                    VERBOSE_DEBUG && DebugEnd("Contextify.construct END");
                    return boxResult;
                } catch (he) {
                    let be;
                    try {
                        be = Contextify(he, "Contextify.function.construct");
                    } catch (e) {
                        throw new Error("Contextify.function.construct, Internal Error");
                    }
                    throw be;
                }
            }
        }
    };

    // set up primordials
    type constructor = { prototype: object };

    function ConnectPrimordial(box: object, host: object): void;
    function ConnectPrimordial(box: constructor, host: constructor): void {
        Contextified.set(host, box);
        Decontextified.set(box, host);
        if (host.prototype && box.prototype) {
            Contextified.set(host.prototype, box.prototype);
            Decontextified.set(box.prototype, host.prototype);
        }
        if (host.constructor && box.constructor) {
            Contextified.set(host.constructor, box.constructor);
            Decontextified.set(box.constructor, host.constructor);
        }
    }

    ConnectPrimordial(String, host.String);
    ConnectPrimordial(Number, host.Number);
    // ConnectPrimordial(Buffer, host.Buffer); // doesn't seem to be present
    ConnectPrimordial(Boolean, host.Boolean);
    ConnectPrimordial(Array, host.Array);
    ConnectPrimordial(Date, host.Date);

    // @ts-ignore
    Error.stackTraceLimit = undefined;
    ConnectPrimordial(Error, host.Error);
    Object.freeze(Error);

    ConnectPrimordial(EvalError, host.EvalError);
    ConnectPrimordial(RangeError, host.RangeError);
    ConnectPrimordial(ReferenceError, host.ReferenceError);
    ConnectPrimordial(SyntaxError, host.SyntaxError);
    ConnectPrimordial(TypeError, host.TypeError);
    ConnectPrimordial(URIError, host.URIError);
    ConnectPrimordial(RegExp, host.RegExp);
    ConnectPrimordial(Function, host.Function);
    ConnectPrimordial(Object, host.Object);

    ConnectPrimordial(Proxy, host.Proxy);
    ConnectPrimordial(Map, host.Map);
    ConnectPrimordial(WeakMap, host.WeakMap);
    ConnectPrimordial(Set, host.Set);
    ConnectPrimordial(WeakSet, host.WeakSet);
    // We should not connect the promises, since then if we get a Promise from the outside, we will apply 
    // the wrong methods to it
    ConnectPrimordial(Symbol, host.Symbol);

    ConnectPrimordial(Reflect, host.Reflect);

    // make the context free from breakouts
    //@ts-ignore
    __proto__ = {};
    //@ts-ignore
    constructor = Object;

    let API = host.Object.create(null);
    API.Decontextify = Decontextify;
    API.Contextify = Contextify;
    return API;
})
