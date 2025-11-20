import * as vscode from 'vscode';
import * as fs from 'fs';
import * as https from 'https';

import { getApi, FileDownloader } from "@microsoft/vscode-file-downloader-api";

import { OISerial } from './com/OISerial';

export let logger: vscode.LogOutputChannel | Console;

export function startLogger(context: vscode.ExtensionContext) {
    if (context.extensionMode === vscode.ExtensionMode.Test) {
        logger = console;
    } else {
        logger = vscode.window.createOutputChannel("OpenIndus Extension", {log: true});
        logger.info("OpenIndus Extension Activated");
    }
}

export const webSiteAddress = "https://openindus.com/";

export const deviceTypeList: string[] = [
    'OICore',
    'OICorelite',
    'OIDiscrete',
    'OIDiscreteVE',
    'OIStepper',
    'OIStepperVE',
    'OIMixed',
    'OIMixedVE',
    'OIAnalogLS',
    'OIRelayLP',
    'OIRelayHP',
    'OIBrushless',
    'OIDC'
];

export function typeToName(input: string): string {
    const typeMap: Record<string, string> = {
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
        '14': 'mixedve',
        '18': 'brushless',
        '21': 'dc'
    };
    return typeMap[getSimpleName(input)] || 'Unknown';
}

export function nameToType(input: string): string {
    const nameMap: Record<string, string> = {
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
        'mixedve': '14',
        'brushless': '18',
        'dc': '21'
    };
    return nameMap[getSimpleName(input)] || 'Unknown';
}

// Return a board without 'OI', '_' and '-'
export function getSimpleName(input: string): string {
    return input.toLowerCase().replaceAll('oi', '').replaceAll('_', '').replaceAll('-', '');
}

export function getClassName(str: string): string {
    const envName = getSimpleName(str);
    return ("OI" + envName.charAt(0).toUpperCase() + envName.slice(1).toLowerCase())
            .replaceAll('ls', 'LS')
            .replaceAll('ve', 'VE')
            .replaceAll('hp', 'HP')
            .replaceAll('lp', 'LP')
            .replaceAll('lite', 'Lite');
}

export function getDefineName(str: string): string {
    const envName = getSimpleName(str);
    return ("OI_" + envName.toUpperCase())
            .replaceAll('LS', '_LS')
            .replaceAll('VE', '_VE')
            .replaceAll('HP', '_HP')
            .replaceAll('LP', '_LP')
            .replaceAll('LITE', '');
}

export const caseImg = [
    {moduleName: "core", imgName: "core.png", caseName: "BOI23"},
    {moduleName: "corelite", imgName: "corelite.png", caseName: "BOI13"},
    {moduleName: "discrete", imgName: "discrete.png", caseName: "BOI12"},
    {moduleName: "discreteve", imgName: "discrete.png", caseName: "BOI12"},
    {moduleName: "stepper", imgName: "stepper.png", caseName: "BOI13"},
    {moduleName: "stepperve", imgName: "stepper.png", caseName: "BOI13"},
    {moduleName: "mixed", imgName: "discrete.png", caseName: "BOI12"},
    {moduleName: "mixedve", imgName: "discrete.png", caseName: "BOI12"},
    {moduleName: "analogls", imgName: "discrete.png", caseName: "BOI12"},
    {moduleName: "relaylp", imgName: "stepper.png", caseName: "BOI13"},
    {moduleName: "relayhp", imgName: "stepper.png", caseName: "BOI13"},
    {moduleName: "brushless", imgName: "stepper.png", caseName: "BOI13"},
    {moduleName: "dc", imgName: "stepper.png", caseName: "BOI13"}
];

export interface ModuleInfo {
    port: string;
    type: string;
    serialNum: string;
    hardwareVar: string;
    versionSw: string;
    imgName: string;
    caseName: string;
};

export async function getDeviceInfoList(): Promise<ModuleInfo[]> {

	// Retrieve available devices with getConnectedBoards.py
	const moduleInfoList: ModuleInfo[] = [];
    const targetVid = '10C4';
    const ports = await OISerial.list();
    for await (const port of ports) {
        if (port.vendorId === targetVid) {
            const serial = new OISerial(port.path);
            try {
                await serial.connect();
                await serial.getInfo().then((data: Record<string, string>) => {
                    moduleInfoList.push({
                        port: port.path,
                        type: typeToName(data.type),
                        serialNum: data.serialNum,
                        hardwareVar: data.hardwareVar,
                        versionSw: data.versionFw,
                        imgName: "",
                        caseName: ""});
                });
            }
            catch {
                moduleInfoList.push({port: port.path, type: "undefined", serialNum: "undefined", hardwareVar: "undefined", versionSw: "undefined", imgName: "", caseName: ""});
            }
            finally {
                await serial.disconnect();
            }
        }
    }
    return moduleInfoList;
}

export async function getSlaveDeviceInfoList(port: string): Promise<ModuleInfo[] | undefined> {

	// Retrieve available devices with getConnectedBoards.py
	let moduleInfoList: ModuleInfo[] | undefined = [];
    const serial = new OISerial(port);
    try {
        await serial.connect();
        await serial.getSlaves().then((data: Record<string, string>[]) => {
            data.forEach((element: Record<string, string>) => {
                moduleInfoList!.push({
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
    }
    catch (error: any) {
        logger.error(error);
        moduleInfoList = undefined;
    }
    finally {
        await serial.disconnect();
    }
    return moduleInfoList;
}

export async function pickDevice(portName?: string): Promise<ModuleInfo | undefined> {
    
    let moduleInfoList: ModuleInfo[] | undefined;
    // Progress notification with option to cancel while getting device list
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Retrieving modules informations",
        cancellable: true
    }, async () => {
        moduleInfoList = await getDeviceInfoList();
    });

    if (moduleInfoList === undefined) { return; }
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
    else if (moduleInfoList.length === 1) {
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

export async function downloadNewFirmwaresOnline(context: vscode.ExtensionContext) : Promise<void> {

    const fileDownloader: FileDownloader = await getApi();
    const destinationDirectory = vscode.Uri.joinPath(context.extensionUri, 'resources', 'binaries');

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
        const firmwareSourceVersionList =  Array.from(new Set((response as string).match(/oi-firmware-v\d+\.\d+\.\d+/g))) || [];
        logger.info("Firmware files found: " + firmwareSourceVersionList);

        // For all versions found, if the directory does not exist, download the files
        for (const firmwareSourceVersion of firmwareSourceVersionList) {
            if (fs.existsSync(vscode.Uri.joinPath(destinationDirectory, firmwareSourceVersion).fsPath)) {
                logger.info("Directory already exists: " + firmwareSourceVersion);
                continue; // Skip if the directory already exists
            } else {
                logger.info("Downloading firmware files from: " + firmwareSourceVersion);
                for (const deviceType of deviceTypeList) {
                    for (const file of ['bootloader', 'partitions', 'ota_data_initial', 'firmware']) {
                        const fileName = `${getSimpleName(deviceType).toLowerCase()}_${file}-${firmwareSourceVersion.split('-')[2].split('/')[0]}.bin`;
                        const sourceFileUrl = vscode.Uri.joinPath(vscode.Uri.parse(webSiteAddress), "binaries", firmwareSourceVersion, fileName);
                        const destinationPath = vscode.Uri.joinPath(destinationDirectory, firmwareSourceVersion, fileName);
                        // download source file to destination path via https
                        try {
                            const downloadedFileUri: vscode.Uri = await fileDownloader.downloadFile(
                                sourceFileUrl,
                                fileName,
                                context
                            );
                            // Copy the downloaded file to the destination path
                            await vscode.workspace.fs.copy(downloadedFileUri, destinationPath, { overwrite: true });
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

export async function downloadNewLibrariesOnline(context: vscode.ExtensionContext) : Promise<void> {

    const fileDownloader: FileDownloader = await getApi();
    const destinationDirectory = vscode.Uri.joinPath(context.extensionUri, 'resources', 'libraries');

    // Create directory "resources" if it doesn't exist
    if (!fs.existsSync(destinationDirectory.fsPath)) {
        fs.mkdirSync(destinationDirectory.fsPath, { recursive: true });
    }

    // Get list of files from server
    try {
        const response = await new Promise((resolve, reject) => {
            https.get(`${webSiteAddress}libraries/
                `, res => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => resolve(data));
                res.on('error', reject);
            });
        });

        // Parse the html file to detect all openindus libraries version available
        const openindusLibrariesDirectories = Array.from(new Set((response as string).match(/openindus-v\d+\.\d+\.\d+\.tar.gz/g))) || [];
        logger.info("OpenIndus libraries files found: " + openindusLibrariesDirectories);

        // Parse the html file to detect all libraries version available
        const arduinoLibrariesDirectories = Array.from(new Set((response as string).match(/arduino-esp32-v\d+\.\d+\.\d+.tar.gz/g))) || [];
        logger.info("Arduino libraries files found: " + arduinoLibrariesDirectories);

        // Check that both openindus and arduino libraries are found with same version and make a version common list
        const librariesSourceVersionList: string[] = [];
        openindusLibrariesDirectories.forEach((openindusVersion) => {
            arduinoLibrariesDirectories.forEach((arduinoVersion) => {
                if (openindusVersion.split('openindus-')[1] === arduinoVersion.split('arduino-esp32-')[1]) {
                        librariesSourceVersionList.push(openindusVersion.match(/v\d+\.\d+\.\d+/)![0]);
                }
            });
        });
        logger.info("Common libraries versions found: " + librariesSourceVersionList);

        // For all versions found, if the directory does not exist, download the files
        for (const librarySourceVersion of librariesSourceVersionList) {
            // Download openindus and arduino libraries
            for (const lib of ["openindus-", "arduino-esp32-"]) {
                // OpenIndus libraries
                if (fs.existsSync(vscode.Uri.joinPath(destinationDirectory, lib + librarySourceVersion + ".tar.gz").fsPath)) {
                    logger.info("Library already exists: " + lib + librarySourceVersion + ".tar.gz");
                    continue; // Skip if the directory already exists
                } else {
                    logger.info("Downloading library " + lib + librarySourceVersion + ".tar.gz");
                    const fileName = lib + librarySourceVersion + ".tar.gz";
                    const sourceFileUrl = vscode.Uri.joinPath(vscode.Uri.parse(webSiteAddress), "libraries", fileName);
                    const destinationPath = vscode.Uri.joinPath(destinationDirectory, lib + librarySourceVersion + ".tar.gz");
                    // download source file to destination path via https
                    // try {
                        const downloadedFileUri: vscode.Uri = await fileDownloader.downloadFile(
                            sourceFileUrl,
                            fileName,
                            context
                        );
                        // Copy the downloaded file to the destination path
                        await vscode.workspace.fs.copy(downloadedFileUri, destinationPath, { overwrite: true });
                        logger.info(`Downloaded ${sourceFileUrl} to ${destinationPath}`);

                    // } catch (error) {
                    //     logger.error(`Failed to download ${sourceFileUrl}: ${error}`);
                    //     continue;
                    // }
                }
            }
        }
        // Clear all files in fildeDownloader
        fileDownloader.deleteAllItems(context);

    } catch (error) {
        vscode.window.showErrorMessage('Failed to fetch libraries files');
        throw error;
    }
}
