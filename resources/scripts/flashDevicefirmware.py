try:       
    bootloader = abspath(join('bin', self.boardType.get().lower(), 'bootloader.bin'))
    firmware = abspath(join('bin', self.boardType.get().lower(), 'firmware.bin'))
    ota_data_initial = abspath(join('bin', self.boardType.get().lower(), 'ota_data_initial.bin'))
    partitions = abspath(join('bin', self.boardType.get().lower(), 'partitions.bin'))

    if (self.boardType.get() == 'OICore'):
        app_flash_esp32 = abspath(join('bin', 'app_flash_esp32.bin'))
        esptype = "esp32"
    else:
        app_flash_esp32 = abspath(join('bin', 'app_flash_esp32s2.bin'))
        esptype = "esp32s2"

    returnCode = env.Execute('"$PYTHONEXE" "$UPLOADER"          \
                    --chip %s                                   \
                    --baud 921600                               \
                    --port %s                                   \
                    --before default_reset                      \
                    --after hard_reset                          \
                    write_flash                                 \
                    -z                                          \
                    --flash_mode dio                            \
                    --flash_freq 40m                            \
                    --flash_size detect                         \
                    0x1000 %s                                   \
                    0x8000 %s                                   \
                    0xd000 %s                                   \
                    0x20000 %s                                  \
                    0x3C0000 %s'
    % (esptype, self.serialPort.port, bootloader, partitions, ota_data_initial, firmware, app_flash_esp32))

    if (returnCode != 0):
        raise ValueError('Error while flashing')

    self.check.configure(image = self.successImg)
    
except:
    self.check.configure(image = self.errorImg)

exit(0)