import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ModuleInfo, caseImg, getClassName, getSlaveDeviceInfoList, pickDevice } from '../utils';
import { logger } from "../extension";
import {Mutex} from 'async-mutex';

export async function getSystemInfo(context: vscode.ExtensionContext, portName?: string) {

    let moduleInfo: ModuleInfo = await pickDevice(context, portName);

    if (moduleInfo === undefined) { return; }
    if (moduleInfo.port === undefined) { return; }

    // Find slave modules on bus
    let slaveInfoList: ModuleInfo[] | undefined;

    // Progress notification with option to cancel while getting device list
    if (moduleInfo.type !== undefined) { // If type is undefined, we have no chance to get slave devices
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Reading slaves modules informations",
            cancellable: true
        }, async (progress, token) => {
            if (moduleInfo !== undefined) {
                slaveInfoList = await getSlaveDeviceInfoList(context, token, moduleInfo.port);
            }
        });
    }

    // Find img and case of master module
    moduleInfo.imgName = caseImg[0].imgName; // add default img
    moduleInfo.caseName = caseImg[0].caseName; // add default case
    caseImg.forEach((element: { moduleName: string; imgName: string; caseName: string }) => {
        if (element.moduleName === moduleInfo.type) {
            moduleInfo.imgName = element.imgName; // set good img
            moduleInfo.caseName = element.caseName; // set good case
        }
    });

    // Find img and case of slave module
    if (slaveInfoList !== undefined) {
        slaveInfoList.forEach((slave: ModuleInfo) => {
            slave.imgName = caseImg[0].imgName; // add default img
            slave.caseName = caseImg[0].caseName; // add default case
            caseImg.forEach((element: { moduleName: string; imgName: string; caseName: string }) => {
                if (element.moduleName === slave.type) {
                    slave.imgName = element.imgName; // set good img
                    slave.caseName = element.caseName; // set good case
                }
            });
        });
    }

    // Display a webview with all information about the module
    const panel = vscode.window.createWebviewPanel(
        'SystemInformation',
        'System Information',
        vscode.ViewColumn.One,
        {enableScripts: true}
    );

    const contentUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resources', 'html', 'content')).toString();

    let slaveModuleHtml = '';
    if (slaveInfoList !== undefined && slaveInfoList.length !== undefined && slaveInfoList.length > 0) {   
                slaveModuleHtml = `
                    <div class='slave-container'>
                        <div id='div-canvas'>
                            <canvas id='tree-canvas'></canvas>
                        </div>
                        <div class='slaves'>`;

                let id = 0;
                slaveInfoList.forEach((slave: ModuleInfo) => {
                    slaveModuleHtml +=  `
                        <div class="flex-container slave">
                            <div class="item auto ${slave.caseName}"><img src="${contentUri}/${slave.imgName}"></div>
                            <div class="item auto">
                                <h3>${getClassName(slave.type)}</h3>
                                <div style="border:1px solid #1F1F1F;"></div>
                                <p>
                                    Connected on Bus<br>
                                    <b>Serial Number:</b> ${slave.serialNum}<br>
                                    <b>Hardware Version:</b> ${slave.hardwareVar}<br>
                                    <b>Software version:</b> v${slave.versionSw}
                                </p>
                                <button onClick="flashSlave(` + id + `)">Update firmware</button>
                            </div>
                        </div>`;
                        id++;
                });

                slaveModuleHtml += `
                        </div>
                    </div>`;
                }

    fs.readFile(path.join(context.extensionPath, 'resources', 'html', 'information.html'), (err,data) => {
        if (err) {
            logger.error(err);
        } else {
            let rawHTML = data.toString();
            rawHTML = rawHTML.replaceAll('${content}', contentUri)
                .replace('${moduleType}', getClassName(moduleInfo.type))
                .replace('${modulePort}', moduleInfo.port)
                .replace('${moduleSerialNum}', moduleInfo.serialNum)
                .replace('${moduleHardwareVar}', moduleInfo.hardwareVar)
                .replace('${moduleVersionSw}', moduleInfo.versionSw)
                .replace('${moduleImg}', moduleInfo.imgName)
                .replace('${caseName}', moduleInfo.caseName)
                .replace('${slaveModule}', slaveModuleHtml);
            panel.webview.html = rawHTML;
        }
    });		
    
  	var receivedMessageMutex = new Mutex();

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        message => {
            receivedMessageMutex.runExclusive(async () => {
                switch (message.command) {
                    case 'create-project':
                        logger.info("create project clicked !");
                        vscode.commands.executeCommand('openindus.createProject', moduleInfo, slaveInfoList);
                        return;
                    case 'flash-device':
                        logger.info("flash device clicked !");
                        vscode.commands.executeCommand('openindus.flashDeviceFirmware', undefined, moduleInfo);
                        return;
                    case 'refresh':
                        logger.info("refresh clicked !");
                        if (moduleInfo !== undefined) {
                            vscode.commands.executeCommand('openindus.getSystemInfo', moduleInfo.port);
                            panel.dispose();
                        }
                        return;
                    case 'flash-all-slaves':
                        logger.info("flash all slaves clicked !");
                        if (moduleInfo !== undefined && slaveInfoList !== undefined) {
                            vscode.commands.executeCommand('openindus.flashSlavesDevicesFirmware', moduleInfo.port, slaveInfoList);
                        }
                        return;
                    case 'flash-slave':
                        logger.info("flash slave: " + message.text + " clicked !");
                        if (moduleInfo !== undefined && slaveInfoList !== undefined) {
                            let selectedSlaveInfoList: ModuleInfo[] = []; // We need a list even if there is only one module
                            selectedSlaveInfoList.push(slaveInfoList[Number(message.text)]);
                            vscode.commands.executeCommand('openindus.flashSlavesDevicesFirmware', moduleInfo.port, selectedSlaveInfoList);
                        }
                        return;
                }
            });
        },
        undefined,
        context.subscriptions
    );
}
