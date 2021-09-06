/**
 * Copyright (C) OpenIndus, Inc - All Rights Reserved
 *
 * This file is part of OpenIndus Library.
 *
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * 
 * @file OISystem.h
 * @brief OpenIndus protocole messages
 *
 * For more information on OpenIndus:
 * @see https://openindus.com
 */

#pragma once

#include <stdint.h>
#include <map>

#include "esp_log.h"

#include "OIModule.h"
#include "OIBus.h"
#include "OIFunction.h"


class OISystem
{

public:

    /**
     * @brief Construct a new OISystem object
     * 
     */
    OISystem() {}

    /**
     * @brief Destroy the OISystem object
     * 
     */
    ~OISystem() {}

    /*  user functions */

    /**
     * @brief Initialize the bus and the current module, 
     * create task to manage messages.
     */
    void start(void);

    /**
     * @brief Delete bus task, deinitialize all modules.
     * 
     */
    void stop(void);

    /**
     * @brief Print the status of the system.
     * @todo
     */
    void status(void);

    /*  Module functions */

    /**
     * @brief Set the main Module object.
     * 
     * @param module Current module
     */
    void setModule(OIModule* module);

    /**
     * @brief Get the main Module object
     * 
     * @return OIModule* 
     */
    OIModule* getModule(void);

    /* SubModule fonctions */

    /**
     * @brief Set the Sub Module object
     * 
     * @param module Submodule to add in the system
     */
    void setSubModule(OISubModule* module);

    /**
     * @brief Get the Sub Module object
     * 
     * @param id of module
     * @return OISubModule* 
     */
    OISubModule* getSubModule(uint8_t id);

    /**
     * @brief Run function if exist in function table
     * 
     * @param msg 
     * @return uint32_t 
     */
    uint32_t runFunction(OIMessage msg);

    /**
     * @brief List available functions
     * 
     */
    inline void listFunction(void) {
        FUNCTION.list();
    }

    /**
     * @brief add system functions
     * 
     */
    void attachFunctions(void);

    /**
     * @brief Enter download mode to update a board on the rail
     * 
     */
    void downloadMode();

private:

    /**
     * @brief The system is composed of a module
     * 
     */    
    OIModule *_module;

    /**
     * @brief The system can contain submodules
     * 
     */
    std::map<uint8_t, OISubModule*> _submodules;

    static TaskHandle_t _busCanTaskHandle;
    static TaskHandle_t _busRsTaskHandle;

    static void _busRsTask(void *pvParameters);
    static void _busCanTask(void *pvParameters);

    static bool _isInitialized;
    static bool _isStarted;
};

extern OISystem SYSTEM;