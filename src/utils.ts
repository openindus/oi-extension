import * as vscode from 'vscode';
import { PythonShell } from 'python-shell';
import * as cp from "child_process";

export const deviceTypeList: string[] = 
[
    'OICore',
    'OICorelite',
    'OIDiscrete',
    'OIDiscreteVE',
    'OIStepper',
    'OIStepperVE',
    'OIMixed',
    'OIAnalog_LS',
    'OIRelay_LP',
    'OIRelay_HP',
    'OIDc'
];

export function typeToName(input: string): string {
    
    switch (input) {
        case '3':
            return 'OICore';
        case '4':
            return 'OICorelite';
        case '6':
            return 'OIDiscrete';
        case '7':
            return 'OIDiscreteVE';
        case '11':
            return 'OIStepper';
        case '12':
            return 'OIStepperVE';
        case '8':
            return 'OIMixed';
        case '9':
            return 'OIRelayLP';
        case '10':
            return 'OIRelayHP';
        case '13':
            return 'OIAnalogLS';
        case '21':
            return 'OIDc';
        default:
            return 'Unknown';
    }
}

export function nameToType(input: string): string {
    
    switch (input) {
        case 'Core':
            return '3';
        case 'Corelite':
            return '4';
        case 'Discrete':
            return '6';
        case 'DiscreteVE':
            return '7';
        case 'Stepper':
            return '11';
        case 'StepperVE':
            return '12';
        case 'Mixed':
            return '8';
        case 'RelayLP':
            return '9';
        case 'RelayHP':
            return '10';
        case 'AnalogLS':
            return '13';
        case 'Dc':
            return '21';
        default:
            return '0';
    }
}

// Return a board without 'OI', '_' and '-' and withfist letter capitalize and 'hp', 'ls' capitalized
export function formatStringOI(input: string): string {
    return capitalizeFirstLetter(input.toLowerCase().replaceAll('oi', '')
                                                    .replaceAll('_', '')
                                                    .replaceAll('-', '')
                                                    .replaceAll('ls', 'LS')
                                                    .replaceAll('hp', 'HP')
                                                    .replaceAll('ve', 'VE')
                                                    .replaceAll('lp', 'LP'));
}

export function getFormattedDeviceList(): string[] {
    let formatedDeviceList: string[] = [];
    deviceTypeList.forEach((element)=>{formatedDeviceList.push(formatStringOI(element));});
    return formatedDeviceList;
}

export function capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

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
    {moduleName: "OIRelayLP", imgName: "stepper.png", caseName: "BOI13"},
    {moduleName: "OIDc", imgName: "stepper.png", caseName: "BOI13"}
];


export type ModuleInfo = {
    port: string;
    type: string;
    serialNum: string;
    hardwareVar: string;
    versionSw: string;
    imgName: string;
    caseName: string;
};

export const sourceAddress = "http://openindus.com/oi-content/src/";
export const binAddress = "http://openindus.com/oi-content/bin/";
export const pioProjects = require('os').homedir() + '/Documents/PlatformIO/Projects';
const pioNodeHelpers = require('platformio-node-helpers');
var path = require('path');
import * as https from 'https';
import * as fs from 'fs';

export const execShell = (cmd: string, path: string) =>
    new Promise<string>((resolve, reject) => {
        cp.exec(cmd, {cwd: path}, (err, out) => {
            if (err) {
                return reject(err);
            }
            return resolve(out);
        });
    });

export const IS_WINDOWS = process.platform.startsWith('win');
export function getPlatformIOPythonPath() : string { return path.join(pioNodeHelpers.core.getEnvBinDir(), IS_WINDOWS ? 'python.exe': 'python'); }
export function getEsptoolPath() : string { return path.join(pioNodeHelpers.core.getEnvBinDir(), IS_WINDOWS ? 'esptool.exe': 'esptool.py'); }

export async function getDeviceInfoList(context: vscode.ExtensionContext, token: vscode.CancellationToken): Promise<ModuleInfo[] | undefined> {

	// Retrieve available devices with getConnectedBoards.py
	let moduleInfoList: ModuleInfo[] = [];

	let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/getConnectedDevices.py';
	let pyshell = new PythonShell(myPythonScriptPath, { mode: 'json', pythonPath: getPlatformIOPythonPath() });

	pyshell.on('message', function (message) {
		console.log("List of devices found:");
        console.log(message);
		message.devices.forEach((element: { port: string; type: string; serialNum: string, hardwareVar: string, versionSw: string}) => {
			moduleInfoList.push({
				port: element.port,
				type: typeToName(element.type),
				serialNum: element.serialNum,
				hardwareVar: element.hardwareVar,
				versionSw: element.versionSw,
				imgName: "",
				caseName: ""
			});
		});
	});

	let success = await new Promise( resolve => {
		token.onCancellationRequested(() => {
			pyshell.kill();
			resolve(false);
		});
		pyshell.end(function (err: any, code: any) {
			if (code === 0) {
				resolve(true);
			} else {
				resolve(false);
			}
		});
	});

	if (success === false) {
		return undefined;
	} else {
		return moduleInfoList;
	}
}

export async function getSlaveDeviceInfoList(context: vscode.ExtensionContext, token: vscode.CancellationToken, scanPort: string): Promise<ModuleInfo[] | undefined> {

	// Retrieve available devices with getConnectedBoards.py
	let moduleInfoList: ModuleInfo[] = [];

	let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/getSlaveDevices.py';
	let pyshell = new PythonShell(myPythonScriptPath, { mode: 'json', args: [scanPort, scanPort], pythonPath: getPlatformIOPythonPath() });

	pyshell.on('message', function (message) {
        console.log("List of slaves devices found:");
		console.log(message);
		message.forEach((element: { port: string; type: string; serialNum: string, hardwareVar: string, versionSw: string}) => {
			moduleInfoList.push({
				port: element.port,
				type: typeToName(element.type),
				serialNum: element.serialNum,
				hardwareVar: element.hardwareVar,
				versionSw: element.versionSw,
				imgName: "",
				caseName: ""
			});
		});
	});

	let success = await new Promise( resolve => {
		token.onCancellationRequested(() => {
			pyshell.kill();
			resolve(false);
		});
		pyshell.end(function (err: any, code: any) {
			if (code === 0) {
				resolve(true);
			} else {
				resolve(false);
			}
		});
	});

	if (success === false) {
		return undefined;
	} else {
		return moduleInfoList;
	}
}

export async function pickDevice(context: vscode.ExtensionContext, portName?: string): Promise<ModuleInfo | undefined> {
    
    let moduleInfoList: ModuleInfo[] | undefined;

    // Progress notification with option to cancel while getting device list
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Retrieving modules informations",
        cancellable: true
    }, async (progress, token) => {
        moduleInfoList = await getDeviceInfoList(context, token);
    });


    if (moduleInfoList === undefined) {
        return;
    }
    if (moduleInfoList.length === 0) {
        vscode.window.showWarningMessage("No device connected, please check connection between device and computer");
        return;
    }

    // Fill a quick pick item list with info of all connected module
    const deviceInfoQuickPickItem: vscode.QuickPickItem[] = [];
    moduleInfoList.forEach((element: ModuleInfo) => {
        deviceInfoQuickPickItem.push({description: '$(debug-stackframe-dot) ' + element.port, label: element.type, detail: 'S/N: ' + element.serialNum + ' $(debug-stackframe-dot) HW version: ' + element.hardwareVar + ' $(debug-stackframe-dot) SW version: ' + element.versionSw});
    }); 

    // Let the user choose his module (only if several modules are connected)
    let deviceInfoSelected: vscode.QuickPickItem | undefined = undefined;

    if (portName !== undefined) {
        deviceInfoQuickPickItem.forEach((device: vscode.QuickPickItem) => {
            if (device.description?.includes(portName)) {
                deviceInfoSelected = device;
            }
        });
    } 
    else if (moduleInfoList.length > 1) {
        deviceInfoSelected = await vscode.window.showQuickPick(deviceInfoQuickPickItem, { placeHolder: 'Select the master device', ignoreFocusOut: true });
    } 
    else if (moduleInfoList.length = 1) {
        deviceInfoSelected = deviceInfoQuickPickItem[0];
    }

    if (deviceInfoSelected === undefined) { return; }

    // Find the selected item in moduleInfoList
    let moduleInfo: ModuleInfo | undefined = moduleInfoList[0];
    moduleInfoList.forEach((element: ModuleInfo) => {
        if (deviceInfoSelected?.description?.includes(element.port)) { moduleInfo = element; }
    });

    return moduleInfo;
}

// export async function updateAndSelectFirmwarePath(context: vscode.ExtensionContext) : Promise<string> {

//     return new Promise<string>(async (resolve, reject) => {
//         // Download firmware online
//         async function listDirectoryNames(uri: vscode.Uri): Promise<string[]> {
//             const directoryEntries = await vscode.workspace.fs.readDirectory(uri);
//             return directoryEntries
//                 .filter(([name, type]) => type === vscode.FileType.Directory)
//                 .map(([name]) => name);
//         }

//         const firmwareDirectoryUri = vscode.Uri.joinPath(context.extensionUri, 'resources', 'bin');
//         const firmwareDirectories = await listDirectoryNames(firmwareDirectoryUri);
//     });
    
//         return new Promise((resolve, reject) => {
//             const file = fs.createWriteStream(dest);
//             https.get(url, (response) => {
//                 if (response.statusCode !== 200) {
//                     reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
//                     return;
//                 }
//                 response.pipe(file);
//                 file.on('finish', () => {
//                     file.close(resolve);
//                 });
//             }).on('error', (err) => {
//                 fs.unlink(dest, () => reject(err));
//             });
//         });
//     }

//     const firmwareUrl = `${sourceAddress}firmware/latest/oi-firmware.bin`;
//     const firmwarePath = path.join(context.extensionPath, 'resources', 'bin', 'oi-firmware.bin');

//     await downloadFirmware(firmwareUrl, firmwarePath);

//     // Choose the version
//     // Get path to resource on disk
//     let onDiskPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'bin');
//     let firmwareVersionList = fs.readdirSync(onDiskPath.fsPath);
//     let binVersions: vscode.QuickPickItem[] = [];
//     firmwareVersionList.forEach((element) => {
//         if (fs.statSync(onDiskPath.fsPath + '/' + element).isDirectory()) {
//             if (element.split('oi-firmware-')[1].length >= 5) { // 0.0.0 --> min length is 5
//                 binVersions.unshift({label: element.split('oi-firmware-')[1]});
//             }
//         }
//     });

//     let version = vscode.window.showQuickPick(binVersions, {
//         placeHolder: "Select the version (choose the same version used for the main firmware)",
//         ignoreFocusOut: true,
//     });

//     onDiskPath = vscode.Uri.joinPath(onDiskPath, 'oi-firmware-' + version?.label);

//     return firmware.fsPath;
// }
