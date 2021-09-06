set(DRIVERS_SRCS
    drivers/ads866x/ads866x.c
    drivers/dac8760/dac8760.c
    drivers/ledonewire/ledonewire.c
    drivers/powerSTEP01/powerSTEP01.c
    drivers/powerSTEP01/STM32DriversComponents/powerstep01.c
    drivers/L6470/L6470.c
    drivers/L6470/CustomDriversComponents/l6470.c
    drivers/pcal6524/pcal6524.c
    drivers/m41t62/m41t62.c
    drivers/m41t62/STM32DriversComponents/M41T62.c
    drivers/sc16is750/sc16is750.c
    drivers/mcp25625/mcp25625.c
    drivers/mcp25625/DriversComponents/MCP25625.c
    drivers/mcp25625/DriversComponents/MCP25625_hw.c
    drivers/mcp25625/DriversComponents/MCP25625_hal.c
)

set(API_SRCS
    api/OISystem.cpp
    api/OIConsole.cpp
    api/OIBus.cpp
    api/OIModule.cpp
    api/OIRS.cpp
    api/OICAN.cpp
    api/OIType.cpp
    api/OIFlash.cpp
)

if(IDF_TARGET STREQUAL "esp32")
    list(APPEND API_SRCS
        api/OICore.cpp
    )
elseif(IDF_TARGET STREQUAL "esp32s2")
    list(APPEND API_SRCS
        api/OIDiscrete.cpp
        api/OIStepper.cpp
        api/OIMixed.cpp
        api/OIRelay.cpp
    )
endif()

set(COMPONENT_SRCS ${DRIVERS_SRCS} ${API_SRCS})

set(COMPONENT_INCLUDE_DIRS
    ./
    drivers
    api
)

set(COMPONENT_REQUIRES
    esp_adc_cal
    nvs_flash
    console
    app_update
    fatfs
    sdmmc
)

idf_component_register(SRCS ${COMPONENT_SRCS}
    INCLUDE_DIRS ${COMPONENT_INCLUDE_DIRS}
    REQUIRES ${COMPONENT_REQUIRES}
)

set_source_files_properties(drivers/powerSTEP01/STM32DriversComponents/powerstep01.c
    PROPERTIES COMPILE_FLAGS
    "-Wno-missing-field-initializers -Wno-implicit-fallthrough -Wno-maybe-uninitialized"
)

set_source_files_properties(drivers/L6470/CustomDriversComponents/l6470.c
    PROPERTIES COMPILE_FLAGS
    "-Wno-missing-field-initializers -Wno-implicit-fallthrough -Wno-maybe-uninitialized"
)