import { KeepTrackApiEvents } from '@app/interfaces';
import { keepTrackApi } from '@app/keepTrackApi';
import { getEl } from '@app/lib/get-el';
import { DebugMenuPlugin } from '@app/plugins/debug/debug';
import { Camera, CameraType } from '@app/singletons/camera';
import eruda from 'eruda';
import { KeyEvent } from '../input-manager';

export class KeyboardInput {
  private isCreateClockDOMOnce_ = false;
  isCtrlPressed = false;
  isShiftPressed = false;

  init() {
    if (settingsManager.isDisableKeyboard) return;

    const uiManagerInstance = keepTrackApi.getUiManager();

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.ctrlKey === true || e.metaKey === true) this.isCtrlPressed = true;
      if (e.shiftKey === true) this.isShiftPressed = true;
    });
    window.addEventListener('keyup', (e: KeyboardEvent) => {
      if (e.ctrlKey === false || e.metaKey === false) this.isCtrlPressed = false;
      if (e.shiftKey === false) this.isShiftPressed = false;
    });

    if (!settingsManager.disableUI) {
      window.addEventListener('keypress', (e: Event) => {
        this.keyHandler(<KeyboardEvent>e);
      });
      window.addEventListener('keydown', (e: Event) => {
        if (uiManagerInstance.isCurrentlyTyping) return;
        this.keyDownHandler(<KeyboardEvent>e);
      });
      window.addEventListener('keyup', (e: Event) => {
        if (uiManagerInstance.isCurrentlyTyping) return;
        this.keyUpHandler(<KeyboardEvent>e);
      });
    }

    if (settingsManager.disableZoomControls || settingsManager.disableNormalEvents) {
      const stopKeyZoom = (event: KeyboardEvent) => {
        if (event.ctrlKey && (event.code == 'Equal' || event.code == 'NumpadAdd' || event.code == 'NumpadSubtract' || event.code == 'NumpadSubtract' || event.code == 'Minus')) {
          event.preventDefault();
        }
      };

      window.addEventListener('keydown', stopKeyZoom, { passive: false });
    }
  }

  keyEvents = <KeyEvent[]>[];
  keyUpEvents = <KeyEvent[]>[];
  keyDownEvents = <KeyEvent[]>[];

  registerKeyEvent(key: string, callback: () => void) {
    this.keyEvents.push({ key: key.toUpperCase(), callback });
  }

  registerKeyUpEvent({ key, callback }: { key: string; callback: () => void }) {
    this.keyUpEvents.push({ key: key.toUpperCase(), callback });
  }

  registerKeyDownEvent({ key, callback }: { key: string; callback: () => void }) {
    this.keyDownEvents.push({ key: key.toUpperCase(), callback });
  }

  keyUpHandler(evt: KeyboardEvent) {
    this.keyUpEvents
      .filter((event) => event.key == evt.key?.toUpperCase())
      .forEach((event) => {
        event.callback();
      });
  }

  keyDownHandler(evt: KeyboardEvent) {
    this.keyDownEvents
      .filter((event) => event.key == evt.key?.toUpperCase())
      .forEach((event) => {
        event.callback();
      });
  }

  keyHandler(evt: KeyboardEvent) {
    // Error Handling
    if (typeof evt.key == 'undefined') return;

    const timeManagerInstance = keepTrackApi.getTimeManager();
    const uiManagerInstance = keepTrackApi.getUiManager();

    if (uiManagerInstance.isCurrentlyTyping) return;

    switch (evt.key.toUpperCase()) {
      // Open the search bar for faster searching
      // TODO: What if it isn't available?
      case 'F':
        evt.preventDefault();

        if (this.isShiftPressed && !uiManagerInstance.searchManager.isSearchOpen) {
          uiManagerInstance.searchManager.toggleSearch();
          setTimeout(() => {
            getEl('search').focus();
          }, 1000);
          this.releaseShiftKey(keepTrackApi.getMainCamera());
        }
        break;
      // Hide the UI
      case 'H':
        if (this.isShiftPressed) {
          uiManagerInstance.hideUi();
          this.releaseShiftKey(keepTrackApi.getMainCamera());
        }
        break;
      case 'D':
        if (this.isShiftPressed && keepTrackApi.getMainCamera().cameraType !== CameraType.FPS) {
          const debugPlugin = keepTrackApi.getPlugin(DebugMenuPlugin);
          if (!debugPlugin) return;

          if (debugPlugin.isErudaVisible) {
            eruda.hide();
            debugPlugin.isErudaVisible = false;
          } else {
            eruda.show();
            debugPlugin.isErudaVisible = true;
          }
        }
        break;
    }

    switch (evt.key) {
      case '!':
        timeManagerInstance.changeStaticOffset(0); // Reset to Current Time
        settingsManager.isPropRateChange = true;
        break;
      case ',':
        timeManagerInstance.calculateSimulationTime();
        timeManagerInstance.changeStaticOffset(timeManagerInstance.staticOffset - 1000 * 60); // Move back a Minute
        settingsManager.isPropRateChange = true;
        keepTrackApi.runEvent(KeepTrackApiEvents.updateDateTime, new Date(timeManagerInstance.dynamicOffsetEpoch + timeManagerInstance.staticOffset));
        break;
      case '.':
        timeManagerInstance.calculateSimulationTime();
        timeManagerInstance.changeStaticOffset(timeManagerInstance.staticOffset + 1000 * 60); // Move forward a Minute
        settingsManager.isPropRateChange = true;
        keepTrackApi.runEvent(KeepTrackApiEvents.updateDateTime, new Date(timeManagerInstance.dynamicOffsetEpoch + timeManagerInstance.staticOffset));
        break;
      case '<':
        timeManagerInstance.calculateSimulationTime();
        timeManagerInstance.changeStaticOffset(timeManagerInstance.staticOffset - 4000 * 60); // Move back 4 Minutes
        settingsManager.isPropRateChange = true;
        keepTrackApi.runEvent(KeepTrackApiEvents.updateDateTime, new Date(timeManagerInstance.dynamicOffsetEpoch + timeManagerInstance.staticOffset));
        break;
      case '>':
        timeManagerInstance.calculateSimulationTime();
        timeManagerInstance.changeStaticOffset(timeManagerInstance.staticOffset + 4000 * 60); // Move forward 4 Minutes
        settingsManager.isPropRateChange = true;
        keepTrackApi.runEvent(KeepTrackApiEvents.updateDateTime, new Date(timeManagerInstance.dynamicOffsetEpoch + timeManagerInstance.staticOffset));
        break;
      case '0':
        timeManagerInstance.calculateSimulationTime();
        timeManagerInstance.changePropRate(0);
        settingsManager.isPropRateChange = true;
        break;
      case '+':
      case '=':
        timeManagerInstance.calculateSimulationTime();
        if (timeManagerInstance.propRate < 0.001 && timeManagerInstance.propRate > -0.001) {
          timeManagerInstance.changePropRate(0.001);
        }

        if (timeManagerInstance.propRate > 1000) {
          timeManagerInstance.changePropRate(1000);
        }

        if (timeManagerInstance.propRate < 0) {
          timeManagerInstance.changePropRate((timeManagerInstance.propRate * 2) / 3);
        } else {
          timeManagerInstance.changePropRate(timeManagerInstance.propRate * 1.5);
        }
        settingsManager.isPropRateChange = true;
        break;
      case '-':
      case '_':
        timeManagerInstance.calculateSimulationTime();
        if (timeManagerInstance.propRate < 0.001 && timeManagerInstance.propRate > -0.001) {
          timeManagerInstance.changePropRate(-0.001);
        }

        if (timeManagerInstance.propRate < -1000) {
          timeManagerInstance.changePropRate(-1000);
        }

        if (timeManagerInstance.propRate < 0) {
          timeManagerInstance.changePropRate(timeManagerInstance.propRate * 1.5);
        } else {
          timeManagerInstance.changePropRate((timeManagerInstance.propRate * 2) / 3);
        }
        settingsManager.isPropRateChange = true;
        break;
      case '1':
        timeManagerInstance.calculateSimulationTime();
        timeManagerInstance.changePropRate(1);
        settingsManager.isPropRateChange = true;
        break;
    }

    if (settingsManager.isPropRateChange) {
      // timeManagerInstance.calculateSimulationTime();
      timeManagerInstance.synchronize();
      if (settingsManager.isPropRateChange && !settingsManager.isAlwaysHidePropRate && timeManagerInstance.propRate0 !== timeManagerInstance.propRate) {
        if (timeManagerInstance.propRate > 1.01 || timeManagerInstance.propRate < 0.99) {
          if (timeManagerInstance.propRate < 10) uiManagerInstance.toast(`Propagation Speed: ${timeManagerInstance.propRate.toFixed(1)}x`, 'standby');
          if (timeManagerInstance.propRate >= 10 && timeManagerInstance.propRate < 60)
            uiManagerInstance.toast(`Propagation Speed: ${timeManagerInstance.propRate.toFixed(1)}x`, 'caution');
          if (timeManagerInstance.propRate >= 60) uiManagerInstance.toast(`Propagation Speed: ${timeManagerInstance.propRate.toFixed(1)}x`, 'serious');
        } else {
          uiManagerInstance.toast(`Propagation Speed: ${timeManagerInstance.propRate.toFixed(1)}x`, 'normal');
        }
      }

      if (!settingsManager.disableUI) {
        if (!this.isCreateClockDOMOnce_) {
          getEl('datetime-text').innerText = timeManagerInstance.timeTextStr;
          this.isCreateClockDOMOnce_ = true;
        } else {
          getEl('datetime-text').childNodes[0].nodeValue = timeManagerInstance.timeTextStr;
        }
      }
    }
  }

  private releaseShiftKey(mainCameraInstance: Camera) {
    setTimeout(() => {
      this.isShiftPressed = false;
      mainCameraInstance.fpsRun = 1;
      settingsManager.cameraMovementSpeed = 0.003;
      settingsManager.cameraMovementSpeedMin = 0.005;
      mainCameraInstance.speedModifier = 1;
    }, 100);
  }
}
