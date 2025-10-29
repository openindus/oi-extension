import * as vscode from 'vscode';
import * as cp from "child_process";
import { OISerial } from './com/OISerial';
import { logger } from './extension';
import { getApi, FileDownloader } from "@microsoft/vscode-file-downloader-api";
import { Path } from 'typescript';
import { join } from 'path';
var path = require('path');
const https = require('https');
const fs = require('fs');
export const pioProjects = require('os').homedir() + '/Documents/PlatformIO/Projects';
export const webSiteAddress = "https://openindus.com/";

export const deviceTypeList: string[] = 
[
    'core',
    'corelite',
    'discrete',
    'discreteve',
    'stepper',
    'stepperve',
    'mixed',  
    'analogls',
    'relaylp',
    'relayhp',
    'dc'
];

export function typeToName(input: string): string {
    const typeMap: { [key: string]: string } = {
        '3': 'core',
        '4': 'corelite',
        '6': 'discrete',
        '7': 'discreteve',
        '8': 'mixed',
        '9': 'relaylp',
        '10': 'relayhp',
        '11': 'stepper',
        '12': 'stepperve',
        '13': 'analogls',
        '21': 'dc'
    };
    return typeMap[input] || 'Unknown';
}

export function nameToType(input: string): string {
    const nameMap: { [key: string]: string } = {
        'core': '3',
        'corelite': '4',
        'discrete': '6',
        'discreteve': '7',
        'mixed': '8',
        'relaylp': '9',
        'relayhp': '10',
        'stepper': '11',
        'stepperve': '12',
        'analogls': '13',
        'dc': '21'
    };
    return nameMap[input] || 'Unknown';
}

// Return a board without 'OI', '_' and '-'
export function formatStringOItoEnvName(input: string): string {
    return input.toLowerCase().replaceAll('oi', '').replaceAll('_', '').replaceAll('-', '');
}

// Return the oi-firmware env name from a given non formatted board name
export function getClassNameFromEnv(str: string): string {
    var envName = formatStringOItoEnvName(str);
    return ("OI" + envName.charAt(0).toUpperCase() + envName.slice(1).toLowerCase())
            .replaceAll('ls', 'LS')
            .replaceAll('ve', 'VE')
            .replaceAll('hp', 'HP')
            .replaceAll('lp', 'LP')
            .replaceAll('lite', '');
}

export function getNiceNameFromEnv(str: string): string {
    var envName = formatStringOItoEnvName(str);
    return ("OI " + envName.charAt(0).toUpperCase() + envName.slice(1).toLowerCase())
            .replaceAll('ls', ' LS')
            .replaceAll('ve', ' VE')
            .replaceAll('hp', ' HP')
            .replaceAll('lp', ' LP')
            .replaceAll('lite', ' Lite');
}

export const caseImg = [
    {moduleName: "core", imgName: "core.png", caseName: "BOI23"},
    {moduleName: "coreLite", imgName: "corelite.png", caseName: "BOI13"},
    {moduleName: "discrete", imgName: "discrete.png", caseName: "BOI12"},
    {moduleName: "discreteve", imgName: "discrete.png", caseName: "BOI12"},
    {moduleName: "stepper", imgName: "stepper.png", caseName: "BOI13"},
    {moduleName: "stepperve", imgName: "stepper.png", caseName: "BOI13"},
    {moduleName: "mixed", imgName: "discrete.png", caseName: "BOI12"},
    {moduleName: "analogls", imgName: "discrete.png", caseName: "BOI12"},
    {moduleName: "relaylp", imgName: "stepper.png", caseName: "BOI13"},
    {moduleName: "relayhp", imgName: "stepper.png", caseName: "BOI13"},
    {moduleName: "dc", imgName: "stepper.png", caseName: "BOI13"}
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

export function getEsptoolPath() : string {
    let flashScriptPath = join(
      getEspIdfPath(),
      "components",
      "esptool_py",
      "esptool",
      "esptool.py"
    );
    return flashScriptPath;
}

export function getEspIdfPath() : string {
    let a = vscode.workspace.getConfiguration("idf");
    if (IS_WINDOWS) {
        return a.get("espIdfPathWin");
    } else {
        return a.get("espIdfPath");
    }
}

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
                await serial.disconnect();
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
        await serial.disconnect();
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

export async function downloadNewFirmwareOnline(context: vscode.ExtensionContext) : Promise<void> {

    const fileDownloader: FileDownloader = await getApi();
    const destinationDirectory = vscode.Uri.joinPath(context.extensionUri, 'resources');

    // Create directory "resources" if it doesn't exist
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
        
        // Parse the html file to detect all firmware version available
        const sourceDirectories = (response as string).match(/binaries\/oi-firmware-\d+\.\d+\.\d+\//g) || [];
        logger.info("Firmware files found: " + sourceDirectories);

        // For all versions found, if the directory does not exist, download the files
        for (const sourceVersion of sourceDirectories) {
            if (fs.existsSync(vscode.Uri.joinPath(destinationDirectory, sourceVersion).fsPath)) {
                logger.info("Directory already exists: " + sourceVersion);
                continue; // Skip if the directory already exists
            } else {
                logger.info("Downloading firmware files from: " + sourceVersion);
                for (const deviceType of deviceTypeList) {
                    for (const file of ['bootloader', 'partitions', 'ota_data_initial', 'firmware']) {
                        const binaryName = `${deviceType.toLowerCase()}_${file}-${sourceVersion.split('-')[2].split('/')[0]}.bin`;
                        const sourceFileUrl = vscode.Uri.joinPath(vscode.Uri.parse(webSiteAddress), sourceVersion, binaryName);
                        const destinationPath = vscode.Uri.joinPath(destinationDirectory, sourceVersion, binaryName);
                        // download source file to destination path via https
                        try {
                            const downloadedFileUri: vscode.Uri = await fileDownloader.downloadFile(
                                sourceFileUrl,
                                binaryName,
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