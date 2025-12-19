import * as vscode from 'vscode';
import * as fs from 'fs';
import * as CryptoJS from 'crypto-js';

import { NodeTransport, ESPLoader, LoaderOptions, CustomReset, FlashOptions } from './esptool-js/index';
import { deviceTypeList, pickDevice, ModuleInfo, getSimpleName, logger, getClassName } from './utils';

export async function flashDeviceFirmware(context: vscode.ExtensionContext, portName?: string, inputModuleInfo?: ModuleInfo): Promise<void> {
    // Validate input parameters
    if (!context) {
        logger.error('Extension context is not available');
        return;
    }

    let moduleInfo: ModuleInfo | undefined;

    // If device type and port are given, use them; otherwise, prompt user to select
    if (inputModuleInfo === undefined) {
        moduleInfo = await pickDevice(portName);
    } else {
        moduleInfo = inputModuleInfo;
    }

    // Cancel if no module info was selected
    if (!moduleInfo || !moduleInfo.port) {
        logger.info('Device selection cancelled');
        return;
    }

    // Ensure device type is valid
    if (!deviceTypeList.includes(moduleInfo.type)) {
        const deviceSelected = await vscode.window.showQuickPick(deviceTypeList, {
            placeHolder: 'Choose the device type',
            ignoreFocusOut: true
        });

        if (!deviceSelected) {
            logger.info('Device type selection cancelled');
            return;
        }

        moduleInfo.type = deviceSelected;
    }

    // Get firmware versions from resources directory
    const binariesPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'binaries');
    const firmwareVersions = await vscode.workspace.fs.readDirectory(binariesPath);
    
    // Filter valid firmware versions (must be directories and have version format like oi-firmware-x.x.x)
    const validVersions = firmwareVersions
        .filter(([name, type]) => type === vscode.FileType.Directory && name.startsWith('oi-firmware-'))
        .map(([name]) => name.substring('oi-firmware-'.length))
        .filter(version => version.length >= 5) // Ensure version format is at least x.x.x
        .map(label => ({ label } as vscode.QuickPickItem))
        .reverse(); // Show latest versions first

    // If no valid versions found, show error
    if (validVersions.length === 0) {
        vscode.window.showErrorMessage('No firmware versions found in resources/binaries');
        logger.error('No valid firmware versions found in resources/binaries');
        return;
    }

    // Prompt user to select firmware version
    const selectedVersion = await vscode.window.showQuickPick(validVersions, {
        placeHolder: 'Select the version (choose the same version used for the main firmware)',
        ignoreFocusOut: true
    });

    if (!selectedVersion?.label) {
        logger.info('Firmware version selection cancelled');
        return;
    }

    // Construct file paths for all required firmware components
    const version = selectedVersion.label;
    const deviceType = getSimpleName(moduleInfo.type).replace('lite', ''); // Remove 'lite' suffix for file naming
    const firmwarePath = vscode.Uri.joinPath(binariesPath, `oi-firmware-${version}`);

    const bootloaderPath = vscode.Uri.joinPath(firmwarePath, `${deviceType}_bootloader-${version}.bin`);
    const partitionsPath = vscode.Uri.joinPath(firmwarePath, `${deviceType}_partitions-${version}.bin`);
    const otaDataInitialPath = vscode.Uri.joinPath(firmwarePath, `${deviceType}_ota_data_initial-${version}.bin`);
    const firmwareFilePath = vscode.Uri.joinPath(firmwarePath, `${deviceType}_firmware-${version}.bin`);

    // Log file paths for debugging
    logger.info(`Bootloader: ${bootloaderPath.toString()}`);
    logger.info(`Partitions: ${partitionsPath.toString()}`);
    logger.info(`OTA Data: ${otaDataInitialPath.toString()}`);
    logger.info(`Firmware: ${firmwareFilePath.toString()}`);

    // Validate all required files exist
    const requiredFiles = [
        { path: bootloaderPath, name: 'bootloader' },
        { path: partitionsPath, name: 'partitions' },
        { path: otaDataInitialPath, name: 'ota_data_initial' },
        { path: firmwareFilePath, name: 'firmware' }
    ];

    for (const file of requiredFiles) {
        if (!fs.existsSync(file.path.fsPath)) {
            vscode.window.showErrorMessage(`Required file not found: ${file.name} (${file.path.fsPath})`);
            logger.error(`Required file not found: ${file.name} (${file.path.fsPath})`);
            return;
        }
    }

    // Read all firmware files as binary data
    const bootloaderData = fs.readFileSync(bootloaderPath.fsPath).toString('binary');
    const partitionsData = fs.readFileSync(partitionsPath.fsPath).toString('binary');
    const otaDataInitialData = fs.readFileSync(otaDataInitialPath.fsPath).toString('binary');
    const firmwareData = fs.readFileSync(firmwareFilePath.fsPath).toString('binary');

    const transport = new NodeTransport(moduleInfo.port);
    const loaderOptions: LoaderOptions = {
        transport: transport,
        baudrate: 921600,
        romBaudrate: 115200,
        debugLogging: false,
        enableTracing: false,
        resetConstructors: {
            // override only the constructor you need; others will fall back to defaults
            customReset: (transport) => new CustomReset(transport, 'D0|R1|W50|D1|R0')
        }
    };
    const esploader = new ESPLoader(loaderOptions);

    // Flash the firmware with progress reporting
    const successFlash = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Flashing ${getClassName(moduleInfo.type)} on ${moduleInfo.port}`,
        cancellable: true
    }, async (progress) => {
        return new Promise<boolean>(async (resolve) => {
            let result = true;
            try {

                const flashOptions: FlashOptions = {
                    fileArray: [
                        { address: 0x0000, data: bootloaderData },
                        { address: 0x8000, data: partitionsData },
                        { address: 0xd000, data: otaDataInitialData },
                        { address: 0x10000, data: firmwareData }
                    ],
                    eraseAll: true,
                    compress: true,
                    flashSize: "8MB",
                    flashMode: "qio",
                    flashFreq: "80m",
                    reportProgress: (fileIndex, written, total) => {
                        // Only report progress for the last file (firmware)
                        if (fileIndex === 3 && total > 0) {
                            const progressPercent = (written / total) * 100;
                            progress.report({ increment: progressPercent - (progressPercent > 0 ? lastProgressWritten : 0) });
                            lastProgressWritten = progressPercent;
                        }
                    },
                    calculateMD5Hash: (image) => CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image)).toString()
                };

                let lastProgressWritten = 0;

                // Connect
                await esploader.main("custom_reset");
                await esploader.writeFlash(flashOptions);
                result = true;
                
            } 
            catch (error) {
                logger.error('Error during flashing process:', error);
                result = false;
            }
            finally {
                await transport.resetToMainApp();
                await new Promise(resolve => setTimeout(resolve, 200));
                await transport.disconnect();
                resolve(result);
            }
        });
    });

    // Show appropriate message based on result
    if (successFlash) {
        vscode.window.showInformationMessage(`Device ${getClassName(moduleInfo.type)} on ${moduleInfo.port} flashed successfully!`);
    } else {
        vscode.window.showErrorMessage('Unexpected error while flashing device. Check if you don\'t have the port open elsewhere.');
    }
}
