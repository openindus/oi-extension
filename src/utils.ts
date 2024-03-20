// Be careful when changing typo of this list, many side effect could occurs, don't touch this list if you don't know what you are doing

export const deviceTypeList: string[] = 
[
    'OICore',
    'OICoreLite',
    'OIDiscrete',
    'OIDiscrete_VE',
    'OIStepper',
    'OIStepper_VE',
    'OIMixed',
    'OIAnalog_LS',
    'OIRelay_LP',
    'OIRelay_HP'
];

export const caseImg = [
    {moduleName: "OICore", imgName: "core.png", caseName: "BOI23"},
    {moduleName: "OICoreLite", imgName: "corelite.png", caseName: "BOI13"},
    {moduleName: "OIDiscrete", imgName: "discrete.png", caseName: "BOI12"},
    {moduleName: "OIDiscreteVE", imgName: "discrete.png", caseName: "BOI12"},
    {moduleName: "OIStepper", imgName: "stepper.png", caseName: "BOI13"},
    {moduleName: "OIStepperVE", imgName: "stepper.png", caseName: "BOI13"},
    {moduleName: "OIMixed", imgName: "discrete.png", caseName: "BOI12"},
    {moduleName: "OIAnalogLS", imgName: "discrete.png", caseName: "BOI12"},
    {moduleName: "OIRelayLP", imgName: "stepper.png", caseName: "BOI13"},
    {moduleName: "OIRelayLP", imgName: "stepper.png", caseName: "BOI13"}
];

export type ModuleInfo = {
    port: string;
    type: string;
    serialNum: string;
    versionHw: string;
    versionSw: string;
    imgName: string;
    caseName: string;
};

export const sourceAddress = "http://openindus.com/oi-content/src/";
export const binAddress = "http://openindus.com/oi-content/bin/";
export const pioProjects = require('os').homedir() + '/Documents/PlatformIO/Projects';