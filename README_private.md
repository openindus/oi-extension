# Comment développer l'extension

1. Installer node.js
1. Cloner ce repertoire
1. Ouvrir la console npm
1. Initialiser le repertoire npm `npm install` ou bien `npm start`
1. Ouvrir le dossier dans visual studio
1. Run > Start debugging

Si des erreurs surviennent, installer manuellement des packages: ex : `npm install @microsoft/vscode-file-downloader-api`

# Mettre à jour les fichiers binaires

Pour ajouter une version de fichier binaire, copier le dossier généré par oi-firmware (./oi/bin/oi-firware-X.X.X/) dans resources/bin/

# Comment publier l'extension

Suivre le guide suivant https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publishing-extensions

Pour publier, entrer manuellement la version de l'application: `vsce publish 0.0.3`

Pas besoin de mettre a jour dans le package.json, cela se fait automatiquement !