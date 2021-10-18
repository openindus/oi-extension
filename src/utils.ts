// Be careful when changing typo of this list, many side effect could occurs, don't touch this list if you don't know what you are doing

export const deviceTypeList: string[] = 
[
    'OICore',
    'OIDiscrete',
    'OIDiscreteVE',
    'OIStepper',
    'OIStepperVE',
    'OIMixed',
    'OIRelayLP',
    'OIRelayHP'
];

export const sourceAddress = "https://github.com/openindus/oi-firmware/archive/refs/tags/";
export const sourceRefAddress = "https://github.com/openindus/oi-firmware/tags/";
export const binAddress = "http://openindus.com/oi-content/bin/";
export const pioProjects = require('os').homedir() + '/Documents/PlatformIO/Projects';