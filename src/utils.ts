import * as vscode from 'vscode';
import * as cp from "child_process";
import { OISerial } from './com/OISerial';
import { logger } from './extension';
import { getApi, FileDownloader } from "@microsoft/vscode-file-downloader-api";


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
    const typeMap: { [key: string]: string } = {
        '3': 'OICore',
        '4': 'OICorelite',
        '6': 'OIDiscrete',
        '7': 'OIDiscreteVE',
        '8': 'OIMixed',
        '9': 'OIRelayLP',
        '10': 'OIRelayHP',
        '11': 'OIStepper',
        '12': 'OIStepperVE',
        '13': 'OIAnalogLS',
        '21': 'OIDc'
    };
    return typeMap[input] || 'Unknown';
}

export function nameToType(input: string): string {
    const nameMap: { [key: string]: string } = {
        'Core': '3',
        'Corelite': '4',
        'Discrete': '6',
        'DiscreteVE': '7',
        'Mixed': '8',
        'RelayLP': '9',
        'RelayHP': '10',
        'Stepper': '11',
        'StepperVE': '12',
        'AnalogLS': '13',
        'Dc': '21'
    };
    return nameMap[input] || 'Unknown';
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

export const webSiteAddress = "https://openindus.com/";
export const pioProjects = require('os').homedir() + '/Documents/PlatformIO/Projects';
const pioNodeHelpers = require('platformio-node-helpers');
var path = require('path');
const https = require('https');
const fs = require('fs');

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

export async function getDeviceInfoList(context: vscode.ExtensionContext, token: vscode.CancellationToken): Promise<ModuleInfo[]> {

	// Retrieve available devices with getConnectedBoards.py
	let moduleInfoList: ModuleInfo[] = [];

    let targetVid = '10C4';
    let ports = await OISerial.list();
    for await (const port of ports) {
        if (port.vendorId === targetVid) {
            var serial = new OISerial(port.path);
            try {
                await serial.connect();
                await serial.getInfo().then((data: { type: string; serialNum: string; hardwareVar: string; versionFw: string }) => {
                    moduleInfoList.push({
                        port: port.path,
                        type: typeToName(data.type),
                        serialNum: data.serialNum,
                        hardwareVar: data.hardwareVar,
                        versionSw: data.versionFw,
                        imgName: "",
                        caseName: ""});
                });
                await serial.disconnect();
            }
            catch (error) {
                moduleInfoList.push({port: port.path, type: "undefined", serialNum: "undefined", hardwareVar: "undefined", versionSw: "undefined", imgName: "", caseName: ""});
            }
        }
    }

    return moduleInfoList;
}

export async function getSlaveDeviceInfoList(context: vscode.ExtensionContext, token: vscode.CancellationToken, port: string): Promise<ModuleInfo[] | undefined> {

	// Retrieve available devices with getConnectedBoards.py
	let moduleInfoList: ModuleInfo[] = [];

    var serial = new OISerial(port);

    try {
        await serial.connect();
        await serial.getSlaves().then((data: { port: string; type: string; serialNum: string; hardwareVar: string; versionSw: string }[]) => {
            data.forEach((element: { port: string; type: string; serialNum: string, hardwareVar: string, versionSw: string}) => {
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
        await serial.disconnect();
    }
    catch (error) {
        logger.error(error);
        return undefined;
    }

    return moduleInfoList;
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

export async function updateAndSelectFirmwarePath(context: vscode.ExtensionContext) : Promise<string> {

    const fileDownloader: FileDownloader = await getApi();

    const destinationDirectory = vscode.Uri.joinPath(context.extensionUri, 'resources');

    // Create directory if it doesn't exist
    if (!fs.existsSync(destinationDirectory.fsPath)) {
        fs.mkdirSync(destinationDirectory.fsPath, { recursive: true });
    }

    // Get list of files from server
    try {
        const response = await new Promise((resolve, reject) => {
            https.get(`${webSiteAddress}binaries/`, res => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => resolve(data));
                res.on('error', reject);
            });
        });
        
        const sourceDirectories = (response as string).match(/binaries\/oi-firmware-\d+\.\d+\.\d+\//g) || [];
        logger.info("Firmware files found: " + sourceDirectories);

        for (const dir of sourceDirectories) {
            if (fs.existsSync(vscode.Uri.joinPath(destinationDirectory, dir).fsPath)) {
                logger.info("Directory already exists: " + dir);
                continue; // Skip if the directory already exists
            } else {
                logger.info("Downloading firmware files from: " + dir);
                for (const deviceType of getFormattedDeviceList()) {
                    for (const file of ['bootloader', 'partitions', 'ota_data_initial', 'firmware']) {
                        const name = `${deviceType.toLowerCase()}_${file}-${dir.split('-')[2].split('/')[0]}.bin`;
                        const sourceFileUrl = vscode.Uri.joinPath(vscode.Uri.parse(webSiteAddress), dir, name);
                        const destinationPath = vscode.Uri.joinPath(destinationDirectory, dir, name);
                        // download source file to destination path via https
                        try {
                            const downloadedFileUri: vscode.Uri = await fileDownloader.downloadFile(
                                sourceFileUrl,
                                name,
                                context
                            );
                           
                            // Copy the downloaded file to the destination path
                            vscode.workspace.fs.copy(downloadedFileUri, destinationPath, { overwrite: true });
                            logger.info(`Downloaded ${sourceFileUrl} to ${destinationPath}`);

                        } catch (error) {
                            logger.error(`Failed to download ${sourceFileUrl}: ${error}`);
                            continue;
                        }
                    }
                }
            }
        }
        // Clear all files in fildeDownloader
        fileDownloader.deleteAllItems(context);

    } catch (error) {
        vscode.window.showErrorMessage('Failed to fetch firmware files');
        throw error;
    }
}
    
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
