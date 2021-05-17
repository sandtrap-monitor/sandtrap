# SandTrap #

SandTrap; a proxy/Node.js vm based sandbox with support for read/write/call/construct access control. 

### Setup ###

SandTrap is written in TypeScript. To install all needed modules write.

    npm install

This allows you to compile the TypeScript sources to JavaScript by writing.

    make

The result of the compilation is found in the ```out/``` directory.


SandTrap is set up to work as an npm module. Simply copy or link the main SandTrap directory to the node_modules of your project.

### Manual ###

See the [manual](./MANUAL.md) for usage information, information on the policy language and examples.
