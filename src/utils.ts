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

export const sourceAddress = "http://openindus.com/oi-content/src/";
export const binAddress = "http://openindus.com/oi-content/bin/";
export const pioProjects = require('os').homedir() + '/Documents/PlatformIO/Projects';