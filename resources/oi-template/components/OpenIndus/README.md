# OpenIndus

## General Information

This library is based on the [Espressif IoT Development Framework](https://github.com/espressif/esp-idf).

Official documentation is available [here](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s2/index.html).

This repository contains drivers and the **OpenIndus** API used to control the boards.

## Installation Instructions

To install the ESP32 framework (**release/V4.2**), follow these [instructions](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s2/get-started/index.html).

If you hate the command line. Windows Vista is the best OS ever for you. And you like to click like a moron on your mouse, you can use this [user guide](https://www.youtube.com/watch?v=Lc6ausiKvQM).

## Get started

* Create a project.
* Add a component directory:
```
mkdir components
```
* Clone this repository in a component directory:
```
cd components
git submodule add https://gitlab.openindus.com/openindus/oi-soft/oi-library.git
```
* Configure your project with the OpenIndus board:
```
idf.py menuconfig
```
* Build, flash, monitor, enjoy :)
```
idf.py build
idf.py flash && idf.py monitor
```

* Set flash voltage
```
./espefuse.py set_flash_voltage 3.3V
```