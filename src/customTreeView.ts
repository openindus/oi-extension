import * as vscode from 'vscode';

class OIItem extends vscode.TreeItem 
{
	children: OIItem[]|undefined;
  	
	constructor(label: string, command: string | undefined, icon?: string | undefined, children?: OIItem[]|undefined) 
	{
    	super(label, children === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded);
    	if (command) {
     		this.command = {title: label, command};
    	}
        if (icon !== undefined) {
            this.iconPath = new vscode.ThemeIcon(icon);
        }
    	this.children = children;
  	}
}

export class OIAccessTreeProvider implements vscode.TreeDataProvider<OIItem> {
	
	data: OIItem[];
  	
	constructor() {
		this.data = [
			new OIItem('Start a new project', 'openindus.createProject', 'notebook-mimetype'),
			new OIItem('Get system information', 'openindus.getSystemInfo', 'key'),
			new OIItem('Update device firmware', 'openindus.flashDeviceFirmware', 'flame'),
			new OIItem('Get started', 'openindus.openinduswebsite', 'remote-explorer-documentation'),
		];
	}

	getTreeItem(element: OIItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}

	getChildren(element?: OIItem|undefined): vscode.ProviderResult<OIItem[]> {
		if (element === undefined) 
		{
			return this.data;
		}
		return element.children;
	}
}