import { GetSatType, KeepTrackApiEvents } from '@app/interfaces';
import { keepTrackApi } from '@app/keepTrackApi';
import { dateFormat } from '@app/lib/dateFormat';
import { getEl } from '@app/lib/get-el';
import { saveCsv } from '@app/lib/saveVariable';
import { showLoading } from '@app/lib/showLoading';
import { TimeManager } from '@app/singletons/time-manager';
import { SensorMath, TearrData } from '@app/static/sensor-math';
import lookanglesPng from '@public/img/icons/lookangles.png';
import { BaseObject, DetailedSatellite, DetailedSensor } from 'ootk';
import { KeepTrackPlugin, clickDragOptions } from '../KeepTrackPlugin';
import { SelectSatManager } from '../select-sat-manager/select-sat-manager';
import { SoundNames } from '../sounds/SoundNames';
export class LookAnglesPlugin extends KeepTrackPlugin {
  static PLUGIN_NAME = 'Look Angles';
  dependencies = [SelectSatManager.PLUGIN_NAME];
  private selectSatManager_: SelectSatManager;

  constructor() {
    super(LookAnglesPlugin.PLUGIN_NAME);
    this.selectSatManager_ = keepTrackApi.getPlugin(SelectSatManager);
  }

  /**
   * Flag to determine if the look angles should only show rise and set times
   */
  private isRiseSetLookangles_ = true;
  /**
   * The interval between each line of look angles
   */
  private lookanglesInterval_ = 30;
  /**
   * The length of the look angles
   */
  private lookanglesLength_ = 2;
  /**
   * The last look angles array
   */
  private lastlooksArray_: TearrData[];

  isRequireSatelliteSelected: boolean = true;
  isRequireSensorSelected: boolean = true;

  bottomIconElementName = 'look-angles-icon';
  bottomIconLabel = 'Look Angles';
  bottomIconImg = lookanglesPng;
  bottomIconCallback: () => void = () => {
    this.refreshSideMenuData_();
  };

  isIconDisabledOnLoad = true;
  isIconDisabled = true;

  dragOptions: clickDragOptions = {
    isDraggable: true,
    minWidth: 300,
    maxWidth: 450,
  };

  helpTitle = `Look Angles Menu`;
  helpBody = keepTrackApi.html`
    The Look Angles menu allows you to calculate the range, azimuth, and elevation angles between a sensor and a satellite.
    A satellite and sensor must first be selected before the menu can be used.
    <br><br>
    The toggle only rise and set times will only calculate the rise and set times of the satellite.
    This is useful for quickly determining when a satellite will be visible to a sensor.
    <br><br>
    The search range can be modified by changing the length and interval options.`;

  sideMenuElementName: string = 'look-angles-menu';
  sideMenuElementHtml: string = keepTrackApi.html`
    <div id="look-angles-menu" class="side-menu-parent start-hidden text-select">
        <div id="look-angles-content" class="side-menu">
            <div class="row">
            <h5 class="center-align">Sensor Look Angles</h5>
            <div class="row light-blue darken-3" style="height:4px; display:block;"></div>
            <div id="settings-look-angles">
                <h5 class="center-align">Look Angles Settings</h5>
                <div class="switch row">
                <label>
                    <input id="settings-riseset" type="checkbox" checked="true" />
                    <span class="lever"></span>
                    Show Only Rise and Set Times
                </label>
                </div>
                <div class="input-field col s6">
                <input id="look-angles-length" value="2" type="text" data-position="bottom" data-delay="50" data-tooltip="How Many Days of Look Angles Should be Calculated" />
                <label for="look-anglesLength" class="active">Length (Days)</label>
                </div>
                <div class="input-field col s6">
                <input id="look-angles-interval" value="30" type="text" data-position="bottom" data-delay="50" data-tooltip="Seconds Between Each Line of Look Angles" />
                <label for="look-anglesInterval" class="active">Interval</label>
                </div>
                <div class="row"></div>
            </div>
            <table id="looks" class="center-align striped-light centered"></table>
            <br />
            <center>
                <button id="export-look-angles" class="btn btn-ui waves-effect waves-light">Export &#9658;</button>
            </center>
            </div>
        </div>
    </div>`;

  addHtml(): void {
    super.addHtml();
    keepTrackApi.register({
      event: KeepTrackApiEvents.uiManagerFinal,
      cbName: this.PLUGIN_NAME,
      cb: () => {
        getEl('look-angles-length').addEventListener('change', () => {
          this.lookanglesLength_ = parseFloat((<HTMLInputElement>getEl('look-angles-length')).value);
          this.refreshSideMenuData_();
        });

        getEl('look-angles-interval').addEventListener('change', () => {
          this.lookanglesInterval_ = parseInt((<HTMLInputElement>getEl('look-angles-interval')).value);
          this.refreshSideMenuData_();
        });

        getEl('export-look-angles')?.addEventListener('click', () => {
          keepTrackApi.getSoundManager().play(SoundNames.EXPORT);
          saveCsv(this.lastlooksArray_, 'Look-Angles');
        });

        getEl('settings-riseset').addEventListener('change', this.settingsRisesetChange_.bind(this));

        const sat = this.selectSatManager_.getSelectedSat();
        this.checkIfCanBeEnabled_(sat);
      },
    });

    keepTrackApi.register({
      event: KeepTrackApiEvents.selectSatData,
      cbName: this.PLUGIN_NAME,
      cb: (obj: BaseObject) => {
        this.checkIfCanBeEnabled_(obj);
      },
    });

    keepTrackApi.register({
      event: KeepTrackApiEvents.resetSensor,
      cbName: this.PLUGIN_NAME,
      cb: () => {
        this.checkIfCanBeEnabled_(null);
      },
    });
  }

  addJs(): void {
    super.addJs();
    keepTrackApi.register({
      event: KeepTrackApiEvents.staticOffsetChange,
      cbName: this.PLUGIN_NAME,
      cb: () => {
        this.refreshSideMenuData_();
      },
    });
  }

  private checkIfCanBeEnabled_(obj: BaseObject) {
    if (obj?.isSatellite() && keepTrackApi.getSensorManager().isSensorSelected()) {
      this.setBottomIconToEnabled();
      if (this.isMenuButtonActive && obj) {
        this.getlookangles_(obj as DetailedSatellite);
      }
    } else {
      if (this.isMenuButtonActive) {
        this.closeSideMenu();
      }
      this.setBottomIconToDisabled();
    }
  }

  private refreshSideMenuData_ = (): void => {
    if (this.isMenuButtonActive) {
      showLoading(() => {
        const obj = this.selectSatManager_.getSelectedSat(GetSatType.EXTRA_ONLY);
        if (!obj.isSatellite()) return;
        this.getlookangles_(obj as DetailedSatellite);
      });
    }
  };

  private getlookangles_(sat: DetailedSatellite, sensors?: DetailedSensor[]): TearrData[] {
    const timeManagerInstance = keepTrackApi.getTimeManager();

    if (!sensors) {
      const sensorManagerInstance = keepTrackApi.getSensorManager();

      // Error Checking
      if (!sensorManagerInstance.isSensorSelected()) {
        console.debug('satellite.getlookangles requires a sensor to be set!');
        return [];
      }
      sensors = sensorManagerInstance.currentSensors;
    }

    // Set default timing settings. These will be changed to find look angles at different times in future.

    // const orbitalPeriod = MINUTES_PER_DAY / ((satrec.no * MINUTES_PER_DAY) / TAU); // Seconds in a day divided by mean motion
    // Use custom interval unless doing rise/set lookangles - then use 1 second
    let lookanglesInterval = this.isRiseSetLookangles_ ? 1 : this.lookanglesInterval_;

    let looksArray = <TearrData[]>[];
    let offset = 0;
    for (let i = 0; i < this.lookanglesLength_ * 24 * 60 * 60; i += lookanglesInterval) {
      offset = i * 1000; // Offset in seconds (msec * 1000)
      let now = timeManagerInstance.getOffsetTimeObj(offset);
      let looksPass = SensorMath.getTearData(now, sat.satrec, sensors, this.isRiseSetLookangles_);
      if (looksPass.time !== '') {
        looksArray.push(looksPass); // Update the table with looks for this 5 second chunk and then increase table counter by 1
      }
      if (looksArray.length >= 1500) {
        // Maximum of 1500 lines in the look angles table
        break; // No more updates to the table (Prevent GEO object slowdown)
      }
    }

    looksArray.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    this.lastlooksArray_ = looksArray;

    // Populate the Side Menu
    LookAnglesPlugin.populateSideMenuTable_(looksArray, timeManagerInstance);

    return looksArray;
  }

  private static populateSideMenuTable_(lookAngleData: TearrData[], timeManagerInstance: TimeManager) {
    let tbl = <HTMLTableElement>getEl('looks'); // Identify the table to update
    tbl.innerHTML = ''; // Clear the table from old object data
    let tr = tbl.insertRow();
    let tdT = tr.insertCell();
    tdT.appendChild(document.createTextNode('Time'));
    tdT.setAttribute('style', 'text-decoration: underline');
    let tdE = tr.insertCell();
    tdE.appendChild(document.createTextNode('El'));
    tdE.setAttribute('style', 'text-decoration: underline');
    let tdA = tr.insertCell();
    tdA.appendChild(document.createTextNode('Az'));
    tdA.setAttribute('style', 'text-decoration: underline');
    let tdR = tr.insertCell();
    tdR.appendChild(document.createTextNode('Rng'));
    tdR.setAttribute('style', 'text-decoration: underline');

    for (const lookAngleRow of lookAngleData) {
      LookAnglesPlugin.populateSideMenuRow_(tbl, tdT, lookAngleRow, timeManagerInstance, tdE, tdA, tdR);
    }
  }

  private static populateSideMenuRow_(
    tbl: HTMLTableElement,
    tdT: HTMLTableCellElement,
    lookAngleRow: TearrData,
    timeManagerInstance: TimeManager,
    tdE: HTMLTableCellElement,
    tdA: HTMLTableCellElement,
    tdR: HTMLTableCellElement
  ) {
    if (tbl.rows.length > 0) {
      const tr = tbl.insertRow();
      tr.setAttribute('class', 'link');

      tdT = tr.insertCell();
      tdT.appendChild(document.createTextNode(dateFormat(lookAngleRow.time, 'isoDateTime', false)));

      // Create click listener
      tdT.addEventListener('click', () => {
        timeManagerInstance.changeStaticOffset(new Date(dateFormat(lookAngleRow.time, 'isoDateTime', false) + 'z').getTime() - timeManagerInstance.realTime);
        timeManagerInstance.calculateSimulationTime();
        keepTrackApi.runEvent(KeepTrackApiEvents.updateDateTime, new Date(timeManagerInstance.dynamicOffsetEpoch + timeManagerInstance.staticOffset));
      });

      tdE = tr.insertCell();
      tdE.appendChild(document.createTextNode(lookAngleRow.el.toFixed(1)));
      tdA = tr.insertCell();
      tdA.appendChild(document.createTextNode(lookAngleRow.az.toFixed(0)));
      tdR = tr.insertCell();
      tdR.appendChild(document.createTextNode(lookAngleRow.rng.toFixed(0)));
    }
  }

  private settingsRisesetChange_(e: any, isRiseSetChecked?: boolean): void {
    if (typeof e === 'undefined' || e === null) throw new Error('e is undefined');

    isRiseSetChecked ??= (<HTMLInputElement>getEl('settings-riseset')).checked;
    if (isRiseSetChecked) {
      this.isRiseSetLookangles_ = true;
    } else {
      this.isRiseSetLookangles_ = false;
    }
    this.refreshSideMenuData_();
  }
}
