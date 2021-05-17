# SandTrap User Manual

SandTrap provides a two-way enforcement of a given read/write/call/construct access-control policy. This allows SandTrap to be used in
two different modes:

- _Mutual distrust_: the two-way policies allow the host and the sandbox to be protected from each other.
- _Trusted host_: using partial policies and permissive defaults allow the host to be protected from the sandbox code, while retaining full access to the sandbox entities.


Other combinations are possible, but less obviously useful. The most common use case would be a trusted host using SandTrap to run untrusted sandbox code.

## Quickstart

Using SandTrap is as easy as creating a policy handler, a new `SandTrap` instance and the 
start 
using the instance for secure execution of code:

    let sandtrap = require("sandtrap");
    let path = require("path");

    let policyPath = path.join(__dirname, "policies");
    let policy = new sandtrap.Policy.Basic.Policy(policyPath, "quickstart");

    let box = new sandtrap.SandTrap(policy);

    box.Eval("console.log('Hello World!);'");

The above code creates a basic policy handler from the policy file _quickstart.json_ located in the directory indicated 
by `policyPath`. If no such file exists, 
SandTrap creates a new policy file and goes into policy creation mode to create a policy based on the interaction between the sandbox and the host.

When running the above code,  a skeleton policy for the global object is generated. The policy 
is empty apart from 
an entry giving access to `console.log`. 

    {
      "type": "contextify",
      "call": {
        "allow": true,
        "arguments": [
          {}
        ],
        "result": {}
      }
    }

The policy is attached to the `log` method of the `console` object and 
allows call 
access to the method, while posing no additional demands on the argument or return value. The 
policy `type` property indicates the policy as a `"contextify"` policy, which 
means it is 
a policy controlling a function being transferred from the host to the sandbox. The 
`type` property is added by the policy generation to aid the understanding of the 
generated 
policies.

## Architecture overview

SandTrap builds on the node.js vm module and traps all interactions between the two domains, i.e, the 
host and the sandbox. 
This is done by wrapping all transferred objects and functions with proxies. The trapping provides two key features:


-  It ensures that there is no accidental transferral of primordials between the host and the 
sandbox,  
preventing sandbox breakouts otherwise possible from node.js vm module.
-  It enforces the given read/write/call/construct access-control policy.


The security of the sandbox relies on two important properties:


-  The proxying is structural and recursive, ensuring that all interactions are properly handled.
-  The interaction between the host and the sandbox is rooted in a few well-defined places (the 
global object, the exported object, `module.exports`, external requires and exceptions).


Together these two properties ensure that all cross-domain accesses remain proxied and mediated. 

#### Contextification and decontextification

Contextification and decontextification refer to the operations of safely translating between host and sandbox entities. The terminology is
borrowed from the vmtwo. The word contextification comes from the act of bringing a host object
safely into the context of the sandbox, while decontextification is the natural dual. Both directions must be protected since both objects
and functions allow for passing further entities (via reading and writing of properties, and via passing arguments and return values).
At the core of contextification and decontextification lies two types of proxies. Their functionality is 
structural, recursive and dual in the following way:


-  Property reads are covariantly proxied, e.g., reading from a contextified object yields a 
contextified result.
-  Property write are contravariantly proxied, e.g., writing to a contextified object will decontextify 
the value before writing.
-  Arguments to functions and constructors are contravariantly proxied, and the return value is 
covariantly proxied.


#### Local object views

To ensure better functionality when SandTrap is used in the trusted host setting, SandTrap provides local 
object views. Instead of 
failing with a policy violation error, it is possible to configure SandTrap to keep a local copy of modified 
read-only properties. This
way, code that does not follow the mandated policy can be isolated and remain functional instead of being halted. 

#### Proxy overrides

Under certain circumstances, it is important to be able to 
override the otherwise dual proxy behavior 
by 
preventing certain
objects from being contextified or decontextified, or enforcing a contextification or decontextification 
when one would normally not occur.
Proxy overrides are a dangerous construct and can bypass the security of the sandbox if used inappropriately. 

## node.js execution environment

SandTrap provides the possibility for sandboxed code to execute in a secured node.js execution environment. The execution environment provided by
vm is a pure JavaScript environment without access to the node.js specific parts of the node.js execution environment. To build a node.js compatible environment 
SandTrap  must:


-  Provide secure access to the global object extension of node.js.
-  Provide secure access to the CommonJS compatible module system used by node.js.


To do this SandTrap uses a combination of contextification and re-implementation. 

#### Global extensions
The global object extensions of node.js are injected into  SandTrap using contextification.
Access to the extensions is guarded by the global object policy. This is sufficient, also for the 
`setImmediate`, `setInterval` and
`setTimout`, since they demand functions and do not accept strings. Had they accepted 
strings,
like the `Function` constructor, steps 
would have had to be taken to ensure that the created function resided in the sandbox and was not accidentally injected into the host domain.

#### CommonJS
For the CommonJS module system the situation is different. Each loaded module should have access to 
its own `require` function
and `module` object. For this reason, SandTrap contains a full implementation of the 
CommonJS module system. The implementation
provides the same environment that the node.js module system does and mimics the behavior of the 
`require` function
and `module` object while mediating all interaction between the host and the sandbox. 
Built-in and binary modules
must be loaded using the host require and are protected before being made available to the sandbox. The CommonJS implementation
refuses to load built-in and binary modules unless a security policy for the module is provided. This way SandTrap protects from 
loading of built-in and binary modules that are not implicitly allowlisted. For source code modules, 
SandTrap does not 
demand security policies since they are loaded by the CommonJS implementation and not shared with 
the host. The rationale behind this
choice is that source code modules could be included as source code anyhow, thus, it makes sense to avoid restricting them. In case it is vital
that a source code module is shared between the host and the sandbox, it is possible to force this by 
providing a security policy for that module. This
causes SandTrap to load the module using the host require and protecting the loaded module with the given policy.


## The SandTrap class

The SandTrap class contains a constructor that takes two arguments: a policy handler and the monitor 
root directory. It is accessible as `SandTrap` in
the SandTrap module.



    constructor(policy: IPolicy, root?: string)



The monitor root directory is used when computing policy names for files loaded by SandTrap if the file is given with an absolute path to compute a relative path. 
The monitor root is optional. If no monitor root is provided, it defaults to the location of the file using 
SandTrap.

SandTrap objects provide four methods for securely executing code:


    Eval(code: string, policyName: string): any;
    Load(filename: string): any;
    EvalAsModule(code: string, policyName: string, filename? : string): any;
    LoadAsModule(filename: string): any;


#### Eval

The method `Eval` evaluates code given as a string in a plain execution environment, i.e., 
an 
environment that does not provide access to CommonJS. The method
takes the code to be evaluated as a string and the name of the policy that should be used for the result of the evaluation, evaluates the code in the sandbox, 
and returns a decontextified object using the named policy. 

#### Load

The method `Load` evaluates the code in the file corresponding to the given file path 
using a policy 
name inferred from the monitor root and the file path:


-  If the file path is relative, the full path is used as policy name.
-  If the file path is absolute and begins with the monitor root, the file path is truncated with the 
monitor root to form the policy name.


`Load` uses `Eval` to execute the code of the file using the 
computed 
policy name.

#### EvalAsModule

The method `EvalAsModule` behaves similar to `Eval` with the difference 
that 
the code is 
assumed to be a module to be executed in a CommonJS environment. and 
that 
The named policy is used to decontextify `module.exports`, which is the result of 
loading the module. Any future interaction with the module is guarded
by the given policy. If the third argument
is present, it is used to provide the `__filename` and `__dirname` variables 
of the CommonJS environment; otherwise they are suppressed.

#### LoadAsModule

The method `LoadAsModule` functions like `Load` with the difference that 
it uses 
`EvalAsModule` rather than `Eval`. The file path is
used as the basis for the `__filename` and `__dirname` variables of the 
CommonJS environment.



## The Basic Policy class

While SandTrap supports multiple policy implementations, only one is currently present. Basic policies 
support:


-  Global and local policy generation in combination with,
-  Globally and locally disabled policy enforcement, 
-  Module-level access control via the absence or presence of  policies for the modules,
-  Property-level read/write access control,
-  Function/method/constructor-level call and construct control, including support for value-based 
and parameterized policies,
-  Interactive policy generation, where the user is prompted to decide in case of missing policies.



The basic policy handler constructor takes the policy root, the policy name and an optional policy parameter argument. It is available as
`Policy.Basic.Policy` in the SandTrap module.


    constructor(root: string, name: string, parameters?: PolicyParameterData)


The policy root defines the directory where the policy handler searches for policies, the policy name is the name of the main policy data file, and 
policy parameter data. The policy parameter data is a map from names to values used by parameterized policies. 


    type PolicyParameterData = { [key: string]: string }


In case the main policy data file is not present, it is created and defaults to global policy generation is 
enabled. The generated policies are 
named after the actual access path rooted in the host-sandbox interaction surface and stored in the policy root directory using a path 
that reflects the name.



### Policy language

The policy data used and generated by the policy handler consists of a collection of JSON files located. There are three types of policies: property policies controlling
property access, entity policies controlling all objects (including functions and arrays and other types of objects), and call policies controlling constructor/function/method calls.

All policies are rooted in the main policy data file that contains default policy options, how SandTrap 
should act on policy violations, whether `eval` should be allowed in the sandbox or not, 
as well as policy name
of the global policy and the policy manifest.


    interface PolicyData {
        options : PolicyDefaults,
        onerror? : string,
        allowEval : boolean,

        global: string,

        manifest : { [key: string]: string }
    }


The `onerror` property accepts the values `"silent"` which disables policy 
violation 
reporting, `"warn"` which  prints a warning message on 
policy violation, and  `"throw"` which stops the execution and throws a policy violation 
exception. The policy manifest is a map from policy names
to policy files and is used for policy preloading and baseline policy inclusion. 

#### Policy options

The `options` property contains a `PolicyDefaults` object, which contains 
global policy 
defaults. 


    interface PolicyDefaults {
        interactive? : boolean,
        learn? : boolean,

        contextify? : {
            read?: boolean,
            write?: boolean,
            call?: boolean,
            construct?: boolean
        }

        decontextify? : {
            read?: boolean,
            write?: boolean,
            call?: boolean,
            construct?: boolean
        }
    }


The `learn` property controls whether the policy handler is in active mode or learning 
mode. The active mode enforces the provided policy while
using the policy default for interactions not covered by the policy. The learning mode enables policy creation by allowing and recording any performed interaction.
 
The `interactive` property is used during policy generation and controls whether the 
policy handler asks the user for confirmation before extending the policy. This way
the user can override the default allow during generation, but is also alerted to policy extensions triggered during the generation phase.

The `contextify` and `decontextify` properties contain defaults for entities 
going from the host to the sandbox, and from the sandbox to the host. This makes
it possible to have different behavior depending on the the origin of the information. This is the basis 
for running the sandbox in a one-sided fashion only protecting the host from the sandbox. Regardless of the direction, the defaults give values to the read/write/call/construct 
access policy.

As can be noted by the question marks, all parts of the default policy  data are optional. In case of 
missing items, the policy handler falls back on built-in defaults. Currently 
the basic policy handler uses the following defaults in place of missing options:


    {
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



#### Property policies

Property policies control the interaction with properties.  The `read` and the 
`write` properties
 control if the property can be read or written, respectively. On read or write, the corresponding read 
 policy, `readPolicy`, and write 
 policy, `writePolicy`, are used for the entity read or written. Getter and setter policies are inferred from the property 
 policies.


    interface PropertyPolicyData {
        read?: boolean,
        write?: boolean,
        readPolicy?: EntityPolicyData | string
        writePolicy?: EntityPolicyData | string
    }


#### Entity policies

Entity policies control entities, i.e., objects and functions. For all entities the `properties` 
property
provides a map from property names to property policies. For functions, the entity policy also contains
policies for call, `call`,  and construct, `construct`,
 controlling if and how the function can be called or used as a constructor function.

Properties not present in the property policy map are equipped with a default policy. The default policy can be given
in the `options` field which contains policy defaults. The defaults apply to the entity in 
which they are given
and are inherited by all reachable entities up to the next given option. When computing the default policy 
for properties, the policy tree is searched backwards until defaults are found. If the tree does not 
contain local 
options, then the global defaults will be used.


    interface EntityPolicyData {
        options? : PolicyDefaults,
        override?: string,
        properties?: { [key: string]: PropertyPolicyData }
        call?: CallPolicyData,
        construct?: CallPolicyData
    }


Finally, the `override` property governs the proxy overrides. It has two values 
`"protect"` that causes the value
to remain proxied instead of being unproxied by the proxy cache and `"expose"` that 
causes a value to
remain unproxied.

Both flags are potentially dangerous and may lead to insecurities or sandbox malfunction. We advise that care is taken when using overrides.


#### Call and construct policies

Call and construct policies govern the use of functions. 
The `allow` property can either be a boolean or a string. If it is a boolean the value of the 
boolean determines whether the use of the function is
allowed. If it is a string, the string is interpreted as a JavaScript function from the value of the 
arguments to a boolean. Value-based policies
are realized by applying this function to the arguments of the call or constructor. The returned boolean is then used to decide if the call or construct is
allowed.


The policy for the _this_ value, `thisArg`, is only applicable for function calls and 
not object construction, while the 
`arguments` property contains an array with policies for the arguments. Argument 
policies can either be given as a named 
entity policy, an entity policy or as a dependent argument policy. Dependent argument policies are used when certain arguments need
different policies depending on the values of previous arguments. Argument policies are given as an array that is searched for the first match which 
provides the policy for the argument.


    interface CallPolicyData {
        allow? : boolean | string,
        thisArg?: EntityPolicyData | string,
        arguments?: (EntityPolicyData | ArgumentPolicyData[] | string | undefined)[],
        result?: EntityPolicyData | string
    }



#### Dependent argument policies

A dependent argument policy matches if the argument indicated by `dependecy` 
matches the value of `expected`. In such case, the resulting policy is 
`policy`.



    interface ArgumentPolicyData {
        dependency? : number, 
        expected? : string | number | boolean,
        policy : EntityPolicyData | string
    }



##  Policy examples


Below follow some examples on policy generation, policy modification and active use.

### Policies of the global object 

Running the quick start example generates a basic policy 
that allows calls to `console.log`. We will use this example to illustrate how policy files are 
created and how they relate to each other. In the following examples, we will only show smaller 
policy excerpts.



    let sandtrap = require("sandtrap");
    let path = require("path");

    let policyPath = path.join(__dirname, "policies");
    let policy = new sandtrap.Policy.Basic.Policy(policyPath, "quickstart");

    let box = new sandtrap.SandTrap(policy);

    box.Eval("console.log('Hello World!');");


If we look in the `policies` directory, we find a number of generated policy files:



    policies/SandTrap.Eval.json
    policies/global.json
    policies/global
    policies/global/Buffer.json
    policies/global/queueMicrotask.json
    policies/global/console.json
    policies/global/setImmediate.json
    policies/global/setInterval.json
    policies/global/clearTimeout.json
    policies/global/clearInterval.json
    policies/global/process.json
    policies/global/setTimeout.json
    policies/global/console
    policies/global/console/log.json
    policies/global/console/__proto__.json
    policies/global/clearImmediate.json
    policies/quickstart.json


Most of the generated files are stubs and the result of building the node.js environment. The main 
policy file is `quickstart.json`
as requested when creating the policy handler. It contains the default policies, the name of the global policy and a policy manifest.
The policy manifest is loaded on creation of the policy handler and can be used to include policies from various sources.


    {
      "options": {
        "interactive": false,
        "learn": true,
        "contextify": {
          "read": false,
          "write": false,
          "call": false,
          "construct": false
        },
        "decontextify": {
          "read": false,
          "write": false,
          "call": false,
          "construct": false
        }
      },
      "onerror": "warn",
      "global": "global",
      "allowEval": true,
      "manifest": {
        "global": "global.json",
        "global/Buffer": "global/Buffer.json",
        "global/clearImmediate": "global/clearImmediate.json",
        "global/clearInterval": "global/clearInterval.json",
        "global/clearTimeout": "global/clearTimeout.json",
        "global/console": "global/console.json",
        "global/process": "global/process.json",
        "global/queueMicrotask": "global/queueMicrotask.json",
        "global/setImmediate": "global/setImmediate.json",
        "global/setInterval": "global/setInterval.json",
        "global/setTimeout": "global/setTimeout.json",
        "SandTrap.Eval": "SandTrap.Eval.json",
        "global/console/log": "global/console/log.json",
        "global/console/__proto__": "global/console/__proto__.json"
      }
    }


Of those files, `policies/global.json` contains the entity policy for the global object, which 
in turn 
contains a reference to the policy for the console object `policies/global/console.json`.


    {
      "properties": {
        "Buffer": {
          "readPolicy": "global/Buffer"
        },
        "clearImmediate": {
          "readPolicy": "global/clearImmediate"
        },
        "clearInterval": {
          "readPolicy": "global/clearInterval"
        },
        "clearTimeout": {
          "readPolicy": "global/clearTimeout"
        },
        "console": {
          "readPolicy": "global/console"
        },
        "process": {
          "readPolicy": "global/process"
        },
        "queueMicrotask": {
          "readPolicy": "global/queueMicrotask"
        },
        "setImmediate": {
          "readPolicy": "global/setImmediate"
        },
        "setInterval": {
          "readPolicy": "global/setInterval"
        },
        "setTimeout": {
          "readPolicy": "global/setTimeout"
        }
      }
    }


The `policies/global/console.json` file contains the policy data for 
`global/console`. 
In particular, it assigns a read policy to the `log` property.


    {
      "properties": {
        "log": {
          "read": true,
          "readPolicy": "global/console/log"
        },
        "__proto__": {
          "read": true,
          "readPolicy": "global/console/__proto__"
        }
      }
    }


Finally, the entity policy for the log function `policies/global/console/log.json` indicates
that the function is allowed to be called by setting the `allow` property of the call
policy associated with the `call` property to `true`.


    {
      "call": {
        "allow": true,
        "arguments": [
          {}
        ],
        "result": {}
      }
    }


If we modify this file and set the `allow` property to `false`, this will give 
a warning and prevent the call from occurring; but it will not stop the code execution 
since the `onerror` property of the main policy file is set to `"warn"` by 
default.


    Contextify call action on path global/console/log denied.


If we change the `onerror` property of the main policy to `"throw"`, a policy 
violation
exception is thrown.



### Exporting and functors 

The SandTrap sandbox implements the CommonJS module system. Like with NodeJS, any file loaded 
into the sandbox
can export functionality via `modules.exports` or via `exports`.
 When execution of the file is done, the value of `modules.exports` is returned as the 
 result of the execution. 
 Initially, `modules.exports` contains
a modifiable object that can be replaced with any other 
value. For example,
it is not uncommon to replace the object with a function acting like a _functor_, i.e., a function that
takes a number of arguments and returns a module. As for CommonJS `exports` always 
points to the initial 
exports object.

Consider the following functor stored in a file called `export.js`:



    module.exports = function Functor(context) {

      context.readwrite += context.read;
      console.log("context.secret", context.secret);
      console.log("context", context);

    }


If we load the `export.js` file as a module (using LoadAsModule), getting
back and calling the functor providing a shared context object,


    let mod = box.LoadAsModule("export.js");
    mod({ readwrite : "Hello", read : "World!", secret : "Drmhze6EPcv0fN_81Bj-nA" });


we get the following result:



    context.secret Drmhze6EPcv0fN_81Bj-nA
    context {
      readwrite: 'HelloWorld!',
      read: 'World!',
      secret: 'Drmhze6EPcv0fN_81Bj-nA'
    }


We can see how the `readwrite` property has been updated, and how the 
`secret` and the entire context object 
are printed. The policy guarding context object is found in the `export.js.json` file, named 
after the file that was 
loaded as a module. The file contains an entity policy for the returned `module.exports`, 
which in this case is a function (the functor).


    {
      "type": "decontextify",
      "call": {
        "allow": true,
        "thisArg": {},
        "arguments": [
          {
            "properties": {
              "readwrite": {
                "read": true,
                "readPolicy": "export.js[0]/readwrite",
                "write": true,
                "writePolicy": "export.js[0]/readwrite"
              },
              "__proto__": {
                "read": true,
                "readPolicy": "export.js[0]/__proto__"
              },
              "read": {
                "read": true,
                "readPolicy": "export.js[0]/read"
              },
              "secret": {
                "read": true,
                "readPolicy": "export.js[0]/secret"
              }
            }
          }
        ],
        "result": {}
      }
    }


We can see that the policy controlling the context object passed to the functor occurs as the first argument in the
argument array. It is an entity policy that gives read access to the properties `readwrite`, 
`read` and
`secret`.  If we modify the policy to disallow reading the `secret` property 
and rerun the code, we get the
following result:


    Contextify read action on path export.js[0]/secret denied.
    context.secret undefined
    context {
      readwrite: 'HelloWorld!',
      read: 'World!',
      secret: 'Drmhze6EPcv0fN_81Bj-nA'
    }


The read of `context.secret` is denied and gives a warning. The resulting value is 
`undefined` as indicated by the output. However, 
when we print the entire context object using `console.log`, we can still observe the 
secret. 
That is because  `console.log`
is a _host function_ and `context` is a _host object_. 

All host functions have full access to all host objects passed in as arguments (due to proxy caching) unless explicitly protected. Such protection is possible using the
`"override" : "protect"` on the passed object. This disables the proxy caches and 
re-proxies the
object. 



### Module policies and value-based policies

Code running in a SandTrap sandbox can use `require` to import modules. Depending on 
the type of module and the presence of policy files,
the import may be denied or subject to access control.

When a built-in or native module is loaded, SandTrap looks in the contextification map for a policy for 
that module. If no policy is found, the loading of the module is rejected. This allows for a 
coarse-grained control over which modules are allowed to be loaded and which ones 
are not.

Assume the following node.js module that tries to require the `fs` module and use it to 
read and print itself:


    let fs = require("fs");

    let data = fs.readFileSync(`${__dirname}/require.js`, "utf8");
    console.log(data);


On the first execution,  a policy is created for the `fs` module based on the use. To 
prevent 
the use of 
the `fs` module, we can put the monitor into active mode and remove the 
`fs` policy file
from the manifest. This causes the require of `fs` to be denied and results in the 
following:


    Policy forbids requiring fs

    /Users/dhn03/Code/sandtrap/out/sandtrap.js:90
                throw this.Decontextify(e, "SandTrap.EvalInModule.exception");
                ^
    TypeError: fs.readFileSync is not a function
        at Object.<anonymous> (SandTrap.EvalInModule:2:15)
        at SandTrap.EvalAsModule (/Users/dhn03/Code/sandtrap/out/sandtrap.js:86:34)
        at SandTrap.LoadAsModule (/Users/dhn03/Code/sandtrap/out/sandtrap.js:101:21)
        at Object.<anonymous> (/Users/dhn03/Code/sandtrap-tests/paper/require/run.js:9:15)
        at Module._compile (internal/modules/cjs/loader.js:1133:30)
        at Object.Module._extensions..js (internal/modules/cjs/loader.js:1153:10)
        at Module.load (internal/modules/cjs/loader.js:977:32)
        at Function.Module._load (internal/modules/cjs/loader.js:877:14)
        at Function.executeUserEntryPoint [as runMain] (internal/modules/run_main.js:74:12)
        at internal/main/run_main_module.js:18:47


As we can see from the first line in the output, SandTrap forbids `fs`  from being loaded, 
which causes
the the program to fail since `fs.readFileSync` is not a function but 
`undefined`. 
Note that
In order to see the expception, SandTrap must be run in the trusted host mode or the policy 
allow for the inspection of sandbox exceptions --- otherwise it is denied and the printing of the exception fails.

#### Value-based and parameterized policies

To illustrate the use of value-based policies and policy parameterization, we show how to limit
loading of files based on the file extension, where the file extension is given as a parameter. For 
brevity, 
we only parameterize a single allowed extension --- creating more advanced policies is just a matter of expressing them in JavaScript.

In the file corresponding to the `readFileSync` function of `fs`, we replace 
the boolean with a JavaScript
function. The function takes the `thisArg` and the arguments to 
`readFileSync` as arguments and
can use them to compute if the call is valid or not. In this case, we use `path.endsWith` 
to 
check if the given path ends with the file extension that we require. Instead of hardcoding this into the
policy, we use `this.GetPolicyParameter('AllowedFileExtension')` to get the allowed file 
extension.
In the context of value-based policies, the `this` argument refers to the policy object 
corresponding
to the function being called. 


    {
      "call": {
        "allow": "(thisArg, path) => path.endsWith(this.GetPolicyParameter('AllowedFileExtension'))",
        "arguments": [
          {},
          {}
        ],
        "result": {}
      }
    }        


The expression `this.GetPolicyParameter('AllowedFileExtension')` queries the
policy parameters for the `'AllowedFileExtension'`. Policy parameters can be given when 
the policy handler is created.


    let policy = new sandtrap.Policy.Basic.Policy(policyPath, "require", { AllowedFileExtension: ".js"});


If we use `".js"` as above, the program continues working and the module prints its own 
source code while
if we put something else, e.g., `".json"`, the file access is refused:


    Contextify call action on path fs/readFileSync denied.




###  Cross-domain prototype hierarchies and dependent argument policies

Loading classes into the sandbox and using them to extend sandbox classes create mixed prototype 
hierarchy, where 
a host object is injected into the prototype hierarchy of a sandbox object. As a typical example, if
the sandbox creates classes that inherit from `EventEmitter` defined in the built-in 
Node.js module _events_:



    let events = require("events");

    class C extends events.EventEmitter {

        constructor() {
            super();
            this.on("input", (x) => { console.log("input", x.msg); });
            this.on("close", () => { console.log("close"); });
        }

    }

    exports.C = C;
 


If an object of the class `C` is used within the sandbox and values passed, the event 
listeners will first be decontextified and then contextified, i.e., the events will work as intended without 
the contextification getting in the way. 


    let mod = box.LoadAsModule("nodered.js");
    var c = new mod.C();
    c.emit("input", { msg : "Hello World!"});
    c.emit("close");


Running the above code results in the following output:

    input Hello World!
    close

indicating that both handlers are correctly called. The generated policy file for `on` looks 
as follows, i.e., there is one call policy for both handlers:


    {
      "call": {
        "allow": true,
        "arguments": [
          {},
          {
            "call": {
              "allow": true,
              "thisArg": {},
              "arguments": [
                {
                  "properties": {
                    "msg": {
                      "read": true,
                      "readPolicy": "events/prototype/on[1][0]/msg"
                    },
                    "__proto__": {
                      "read": true,
                      "readPolicy": "events/prototype/on[1][0]/__proto__"
                    }
                  }
                }
              ],
              "result": {}
            }
          }
        ],
        "result": {}
      }
    }


Since different events may be subject to different restrictions both w.r.t. which events are allowed and what policies should control the event data
we need a method to tie different policies to the event handlers based on the event name that is given to the `on` method.
  The way SandTrap provides to achieve this is via dependent arguments. 
To make an argument to a function dependent we provide a list of potential policies. In this case we give two: one to be used if the first argument of the 
function is `"input"` and another if the first argument is `"close"`.


    {
      "call": {
        "allow": true,
        "arguments": [
          {},
          [
            {
              "dependency": 0,
              "expected": "input",
              "policy": {
                "call": {
                  "allow": true,
                  "thisArg": {},
                  "arguments": [
                    {
                      "properties": {
                        "msg": {
                          "read": true,
                          "readPolicy": "events/prototype/on[1][0]/msg"
                        },
                        "__proto__": {
                          "read": true,
                          "readPolicy": "events/prototype/on[1][0]/__proto__"
                        }
                      }
                    }
                  ],
                  "result": {}
                }
              }
            },
            {
              "dependency": 0,
              "expected": "close",
              "policy": {
                "call": {
                  "allow": true,
                  "thisArg": {},
                  "arguments": [],
                  "result": {}
                }
              }
            }
          ]
        ],
        "result": {}
      }
    }  


This policy assigns different policies to the handler (the second argument of the _on_ method) 
depending on the value of the first, which allows us to control which events are allowed cross-domain 
as well as assign access control policies for the event data. Setting `"read"` to 
`false` for the `"input"` event handlers


    "msg": {
      "read": false,
      "readPolicy": "events/prototype/on[1][0]/msg"
    }


prevents the `"input"` event handlers from reading the event message, while setting 


    "call": {
      "allow": false,
      ...
    }


`call` to `false` in case the registered event is `"close"` would 
prevent the host from emitting  `"close"` events on  `C` objects.




### Potentially dangeorus modules

The Node.js vm module can be used to introduce a new context. If the Node.js vm module is used inside a SandTrap sandbox the presence of this new
domain may cause the dual proxying to go out of sync, since it will treat the context provided by the Node.js vm module as part of the host, which it is not. As an example, 
consider the 
following program:


    let vm = require("vm");

    module.exports = function (hostObject) {        
      let context = vm.createContext(hostObject)
      let script = new vm.Script("var x = 15; y;");
      let result = script.runInContext(context);
      console.log(context);
    }
        
        
Using the module as follows:


    let f = box.LoadAsModule("module.js");
    f({ y : "host" })


produces the following output:

    { y: 'host', x: 15 }


Since the vm module must be loaded using the host's `require`, it must be contextified 
and, transitively, the API provided by the module and any
objects created by it. Thus, both `context`, `script`, and 
`result` will be contextified in the above code. While this is accurate
and necessary for `context` and `script`, it is both inaccurate and 
dangerous for `result`, which, unless the script is accidentally given access to the host 
object, will not be a host object. Indeed, it will be an object originating from another vm distinct from 
both the host and the sandbox. Similarly, but perhaps more direct, the contextification of 
`vm.createContext` will decontextify the _hostObject_ used as the basis for the 
context object. This would strip all protection associated with the host object, including access to its 
primordial and reintroduce the breakouts SandTrap protects against.
We can see this, since even though the code interacts with the host object, no interaction is captured by SandTrap. If we look in the policy file of the module, there is no policy on the argument to the functor.


    {
      "type": "decontextify",
      "call": {
        "allow": true,
        "thisArg": {},
        "arguments": [
          {}
        ],
        "result": {}
      }
    }



That is because the cache removes the contextification when passing the 
`hostObject` to
 `createContext`. Thus, we must override the caching behavior of the first argument to 
 `createContext`  to ensure that we retain the protection in case it is a host object. 


    "vm.createContext": {
        "callPolicy": {
            "arguments": [
                {
                    "override": "expose"
                }
            ],
            "result": {}
        },
        "call": true
    }
    


By using the override `"expose"` on the argument (rather than `"protect"`), 
we prohibit the decontextification entirely. This makes sense since the
script manipulating the context is, to all intents and purposes, a sandbox script. 

The resulting module policy clearly indicates the read of `y` and the write of 
`x` also enabling control.


    {
      "call": {
        "allow": true,
        "thisArg": {},
        "arguments": [
          {
            "properties": {
              "__proto__": {
                "read": true,
                "readPolicy": "module.js[0]/__proto__"
              },
              "x": {
                "write": true,
                "writePolicy": "module.js[0]/x"
              },
              "y": {
                "read": true,
                "readPolicy": "module.js[0]/y"
              }
            }
          }
        ],
        "result": {}
      }
    }


Finally, objects returned from executing scripts are not
host objects and should not be contextified. This is important since if it is returned to the host, we do 
not want it to be decontextified
to (which the caching would otherwise do) the original object, since then host interaction with that object could introduce breakouts. We
fix this by exposing the result, thus preventing contextification.


    {
      "call": {
        "allow": true,
        "arguments": [
          {}
        ],
        "result": {
          "override" : "expose"
        }
      }
    }

