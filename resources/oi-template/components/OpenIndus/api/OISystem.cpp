#include "OISystem.h"

#include "esp_ota_ops.h"
#include "esp_partition.h"

static const char OI_SYSTEM_TAG[] = "OISystem";

TaskHandle_t OISystem::_busRsTaskHandle;
TaskHandle_t OISystem::_busCanTaskHandle;
bool OISystem::_isInitialized = false;
bool OISystem::_isStarted = false;

void OISystem::start()
{
    if (_isStarted == false)
    {
        ESP_LOGI(OI_SYSTEM_TAG, "start the system");

        if (_isInitialized == false)
        {
            /* initalize the bus */
            ESP_LOGI(OI_SYSTEM_TAG, "initalize the bus");
            RS_P.init();
            TWAI_S.init();

            /* initalize the  module */
            ESP_LOGI(OI_SYSTEM_TAG, "initalize the module 0x%02x", _module->getId());
            _module->init();
            _module->setId(_module->getHardwareId());
            _module->attachFunctions();

            #ifdef CONFIG_OI_CORE
            for (auto it=_submodules.begin(); it!=_submodules.end(); ++it)
            {
                ESP_LOGI(OI_SYSTEM_TAG, "initalize the submodule 0x%02x", it->first);            
                it->second->setSenderId(_module->getHardwareId());
                it->second->ledBlink(LED_GREEN, 1000);
            }
            _module->ledBlink(LED_GREEN, 1000);
            #endif
                    
            _isInitialized = true;
        }

        /* create task control */
        #ifndef DISABLE_RS_TASK
        xTaskCreate(_busRsTask, "bus task to receive rs message", 4096, this, 1, &_busRsTaskHandle);
        #endif
        #ifndef DISABLE_CAN_TASK
        xTaskCreate(_busCanTask, "bus task to receive can message", 4096, this, 1, &_busCanTaskHandle);
        #endif
    
        attachFunctions();

        _isStarted = true;
    }
}

void OISystem::stop(void)
{
    /* deinitalize the bus */
    ESP_LOGI(OI_SYSTEM_TAG, "stop the system");
    
    assert(_busRsTaskHandle != NULL);
    vTaskDelete(_busRsTaskHandle);
    assert(_busCanTaskHandle != NULL);
    vTaskDelete(_busCanTaskHandle);
    _isStarted = true;
}

void OISystem::status(void)
{
    /**
     * @todo afficher l'état du système
     * 
     */
}

void OISystem::setModule(OIModule* module)
{
    assert(module != NULL);
    _module = module;
}

OIModule* OISystem::getModule(void)
{
    return _module;
}

void OISystem::setSubModule(OISubModule* module)
{
    uint8_t id = module->getDestId();

    assert(module != NULL);
    /* add submodule in the table */
    auto it = _submodules.insert(std::map<uint8_t, OISubModule*>::value_type(id, module));
    if (!it.second)
    {
        ESP_LOGW(OI_SYSTEM_TAG, "submodule 0x%02x already exists",id);
    }
    else
    {
        ESP_LOGV(OI_SYSTEM_TAG, "submodule 0x%02x inserted", id);
    }
}

OISubModule* OISystem::getSubModule(uint8_t id)
{
    /* search submodule in the table */
    if (_submodules.find(id) != _submodules.end())
    {
        return _submodules.at(id);
    }
    else
    {
        ESP_LOGW(OI_SYSTEM_TAG, "module 0x%02x not found in the table", id);
        return NULL;
    }
}

uint32_t OISystem::runFunction(OIMessage msg)
{
    if (FUNCTION.exist(msg))
    {
        return FUNCTION.run(msg);
    }
    else
    {
        ESP_LOGW(OI_SYSTEM_TAG, "command does not exist: 0x%02x", msg.getType());
        return 0;
    }
}

void OISystem::_busRsTask(void *pvParameters)
{
    OISystem* system = (OISystem*)pvParameters;
    assert(system != NULL);

    OIMessage msg;
    uint8_t id;
    uint32_t data;

    ESP_LOGV(OI_SYSTEM_TAG, "run rs task bus");
    
    while (1)
    {
        if (RS_P.receiveMessage(msg, id) != -1)
        {
            assert(system->getModule() != NULL);

            if (id == (system->getModule())->getId() || id == BROADCAST_ID)
            {
                if ((msg.getType() & MASK_SET) == TYPE_SET)
                {
                    ESP_LOGV(OI_SYSTEM_TAG, "received set message");

                    if (id != BROADCAST_ID)
                    {
                        RS_P.sendMessage(OIMessage(msg.getType(), (system->getModule())->getId(), msg.getConf()), msg.getId());
                    }
                    system->runFunction(msg);
                }
                else if ((msg.getType() & MASK_GET) == TYPE_GET)
                {
                    ESP_LOGV(OI_SYSTEM_TAG, "received get message");

                    /* run the command */
                    data = system->runFunction(msg);

                    if (id != BROADCAST_ID)
                    {
                        id = msg.getId();
                        msg.setId((system->getModule())->getId());
                        msg.setData(data);
                        RS_P.sendMessage(msg, id);
                    }
                }
                else if ((msg.getType() & MASK_SEND) == TYPE_SEND)
                {
                    ESP_LOGV(OI_SYSTEM_TAG, "received send message");
                    system->runFunction(msg);
                }
            }
        }
    }
}

void OISystem::_busCanTask(void *pvParameters)
{
    OISystem* system = (OISystem*)pvParameters;
    assert(system != NULL);

    OIMessage msg;
    uint8_t id;

    ESP_LOGV(OI_SYSTEM_TAG, "run can task bus");
    
    while (1)
    {
        if (TWAI_S.receiveMessage(msg, id) != -1)
        { 
            if (id == (system->getModule())->getId() || id == BROADCAST_ID)
            {
                if ((msg.getType() & MASK_SEND) == TYPE_SEND)
                {
                    system->runFunction(msg);
                }
                else
                {
                    ESP_LOGW(OI_SYSTEM_TAG, "unknow message");
                }
            }
        }
    }
}

void OISystem::downloadMode()
{
    // Set update partition for next boot
    const esp_partition_t *update_partition = esp_ota_get_next_update_partition(NULL);
    assert(update_partition != NULL);
    esp_ota_set_boot_partition(update_partition);
    esp_restart();
}

void OISystem::attachFunctions(void)
{
    ESP_LOGI(OI_SYSTEM_TAG, "adding system functions");

    FUNCTION.add(OIMessage(CMD_SYSTEM, (getModule())->getId()), [this](OIMessage msg) -> uint32_t {
        
        if ((msg.getConf() & 0xFF00) == 0x0100)
        {
            if ((msg.getConf() & 0x00FF) == 0x00)
            {
                ESP_LOGV(OI_SYSTEM_TAG, "suspending rs bus");
                vTaskSuspend(_busRsTaskHandle);
            }
            else if ((msg.getConf() & 0x00FF) == 0x01)
            {
                ESP_LOGV(OI_SYSTEM_TAG, "resuming rs bus");
                RS_P.flush();
                RS_P.resetEventQueue();
                vTaskResume(_busRsTaskHandle);
            }
        }
        else if ((msg.getConf() & 0xFF00) == 0x0200)
        {
            if ((msg.getConf() & 0x00FF) == 0x00)
            {
                ESP_LOGV(OI_SYSTEM_TAG, "suspending can bus");
                vTaskSuspend(_busCanTaskHandle);
                TWAI_S.deinit();
            }
            else if ((msg.getConf() & 0x00FF) == 0x01)
            {
                ESP_LOGV(OI_SYSTEM_TAG, "resuming can bus");
                TWAI_S.init();
                vTaskResume(_busCanTaskHandle);
            }
        }
        return 0;
    });

    FUNCTION.add(OIMessage(CMD_DOWNLOAD_MODE, (getModule())->getId()), [this](OIMessage msg) -> uint32_t { 
        downloadMode(); 
        return 0;
    });
}

OISystem SYSTEM;
OIFunction FUNCTION;