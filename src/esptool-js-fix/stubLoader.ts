import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { logger } from '../extension';

/**
 * Custom stub loader that loads JSON files from extension resources
 * instead of node_modules to avoid dynamic import issues in VS Code extensions
 */
export function getStubJsonByChipName(chipName: string): any {
    // Get the extension path
    const extensionUri = vscode.extensions.getExtension('openindus.oi-extension')?.extensionUri;
    if (!extensionUri) {
        throw new Error('Could not find extension path');
    }
    
    // Construct path to stub JSON files in extension resources
    const stubPath = vscode.Uri.joinPath(extensionUri, 'src',  'esptool-js-fix', 'stub_flasher');
    const jsonPath = vscode.Uri.joinPath(stubPath, `stub_flasher_${chipName.toLowerCase().replace('esp', '').replace('-', '')}.json`);
    
    try {
        // Read and parse the JSON file
        const jsonContent = fs.readFileSync(jsonPath.fsPath, 'utf8');
        const jsonStub = JSON.parse(jsonContent);
        
        // Return the stub data with decoded data
        return {
            bss_start: jsonStub.bss_start,
            data: jsonStub.data,
            data_start: jsonStub.data_start,
            entry: jsonStub.entry,
            text: jsonStub.text,
            text_start: jsonStub.text_start,
            decodedData: decodeBase64Data(jsonStub.data),
            decodedText: decodeBase64Data(jsonStub.text),
        };
    } catch (error) {
        logger.error(`Error loading stub JSON for ${chipName}:`, error);
        return null;
    }
}

/**
 * Decode base64 data to Uint8Array
 */
function decodeBase64Data(dataStr: string): Uint8Array {
    // Use atob-lite for base64 decoding
    const decoded = atob(dataStr);
    const chardata = decoded.split("").map(function (x) {
        return x.charCodeAt(0);
    });
    return new Uint8Array(chardata);
}

// Import atob-lite for base64 decoding
// This will be available in the extension context
declare function atob(str: string): string;
