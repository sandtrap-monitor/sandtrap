interface PropertyPolicyData {
    read?: boolean,
    write?: boolean,
    readPolicy?: EntityPolicyData | string
    writePolicy?: EntityPolicyData | string
}

interface EntityPolicyData {
    type?: string, // contextify or decontextify
    options? : PolicyDefaults,
    override?: string,
    properties?: { [key: string]: PropertyPolicyData }
    call?: CallPolicyData,
    construct?: CallPolicyData
}

interface CallPolicyData {
    allow? : boolean | string,
    thisArg?: EntityPolicyData | string,
    arguments?: (EntityPolicyData | ArgumentPolicyData[] | string | undefined)[],
    result?: EntityPolicyData | string
}

interface ArgumentPolicyData {
    dependency? : number, 
    expected? : string | number | boolean,
    policy : EntityPolicyData | string
}

type EntityPolicyDataMap = { [key: string]: EntityPolicyData | undefined }

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

interface PolicyData {
    options : PolicyDefaults,
    onerror? : string, // silent, warn, throw
    allowEval : boolean,

    global: string,

    manifest : { [key: string]: string }
}
