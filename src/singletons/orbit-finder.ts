import { Degrees, DetailedSatellite, EciVec3, Kilometers, SatelliteRecord, Sgp4, TleLine1, TleLine2, eci2lla } from 'ootk';
import { StringPad } from '../lib/stringPad';
import { SatMath } from '../static/sat-math';

enum PropagationOptions {
  MeanAnomaly = 1,
  RightAscensionOfAscendingNode = 2,
  ArgumentOfPerigee = 3,
}

enum PropagationResults {
  Near = 0,
  Success = 1,
  Error = 2,
  Far = 3,
}

export class OrbitFinder {
  static readonly MAX_LAT_ERROR = <Degrees>0.1;
  static readonly MAX_LON_ERROR = <Degrees>0.1;
  static readonly MAX_ALT_ERROR = <Kilometers>30;
  intl: string;
  epochyr: string;
  epochday: string;
  meanmo: string;
  inc: string;
  ecen: string;
  TLE1Ending: string;
  newMeana: string;
  newArgPer: string;
  goalAlt: number;
  raanOffset: number;
  lastLat: number;
  currentDirection: 'N' | 'S';
  sat: DetailedSatellite;
  goalDirection: string;
  goalLon: number;
  goalLat: number;
  now: Date;
  argPerCalcResults: PropagationResults;
  meanACalcResults: PropagationResults;
  raanCalcResults: PropagationResults;
  argPer: string;

  constructor(sat: DetailedSatellite, goalLat: Degrees, goalLon: Degrees, goalDirection: 'N' | 'S', now: Date, goalAlt?: Kilometers, raanOffset?: number) {
    this.sat = sat;
    this.now = now;
    this.goalLat = goalLat;
    this.goalLon = goalLon;
    this.goalDirection = goalDirection;
    this.newMeana = null;
    this.newArgPer = null;
    this.goalAlt = goalAlt || null;
    this.raanOffset = raanOffset || 0;
    this.lastLat = null;
    this.currentDirection = null;
    this.argPerCalcResults = null;
    this.meanACalcResults = null;
    this.raanCalcResults = null;
  }

  /**
   * Rotates a satellite's orbit to a given latitude and longitude at a given time, and returns the new orbit's RAAN and argument of perigee.
   * @param sat The satellite object.
   * @param goalLat The desired latitude in degrees.
   * @param goalLon The desired longitude in degrees.
   * @param goalDirection The desired direction of the satellite's movement ('N' for north or 'S' for south).
   * @param now The current time.
   * @param goalAlt The desired altitude in kilometers (optional, defaults to the satellite's current altitude).
   * @param raanOffset The desired RAAN offset in degrees (optional, defaults to 0).
   * @returns An array containing the new RAAN and argument of perigee in degrees.
   */
  rotateOrbitToLatLon(): [string, string] {
    this.parseTle();

    this.meanACalcResults = this.meanACalcLoop(this.now, this.goalDirection);
    if (this.meanACalcResults !== PropagationResults.Success) {
      return ['Error', 'Failed to find a solution for Mean Anomaly'];
    }

    if (this.goalAlt > 0) {
      const argPerCalcResults = this.argPerCalcLoop();
      if (argPerCalcResults !== PropagationResults.Success) {
        return ['Error', 'Failed to find a solution for Argument of Perigee'];
      }
    }

    this.raanCalcResults = this.raanCalcLoop(this.raanOffset, this.now);
    if (this.raanCalcResults !== PropagationResults.Success) {
      return ['Error', 'Failed to find a solution for Right Ascension of Ascending Node'];
    }

    return [this.sat.tle1, this.sat.tle2];
  }

  private argPerCalcLoop(): PropagationResults {
    this.meanACalcResults = PropagationResults.Near;
    for (let offset = 0; offset < 360 * 10; offset += 1) {
      // Start with this.argPer - 10 degrees
      let posVal = parseFloat(this.argPer) * 10 - 100 + offset;
      if (posVal > 360 * 10) {
        posVal = posVal - 360 * 10;
      }
      this.argPerCalcResults = this.argPerCalc(posVal.toString(), this.now);

      // Found it
      if (this.argPerCalcResults === PropagationResults.Success) {
        if (this.meanACalcResults === PropagationResults.Success) {
          if (this.currentDirection === this.goalDirection) {
            break;
          }
        }
      }

      // Really far away
      if (this.argPerCalcResults === PropagationResults.Far) {
        offset += 49;
      }

      // Broke
      if (this.argPerCalcResults === PropagationResults.Error) {
        return PropagationResults.Error;
      }

      this.meanACalcResults = this.meanACalcLoop2();
      if (this.meanACalcResults === PropagationResults.Success) {
        if (this.currentDirection !== this.goalDirection) {
          offset = offset + 20;
        } else if (this.argPerCalcResults === PropagationResults.Success) {
          break;
        }
      }
      offset = this.meanACalcResults === PropagationResults.Far ? offset + 100 : offset;
      if (this.meanACalcResults === PropagationResults.Error) {
        return PropagationResults.Error;
      }
    }
    return this.argPerCalcResults;
  }

  private meanACalcLoop2(): PropagationResults {
    for (let posVal = 0; posVal < 520 * 10; posVal += 1) {
      this.meanACalcResults = this.meanACalc(posVal, this.now);
      if (this.meanACalcResults === PropagationResults.Success) {
        if (this.currentDirection !== this.goalDirection) {
          posVal = posVal + 20;
        } else {
          break;
        }
      }
      posVal = this.meanACalcResults === PropagationResults.Far ? posVal + 100 : posVal;
      if (this.meanACalcResults === PropagationResults.Error) {
        return PropagationResults.Error;
      }
    }
    return this.meanACalcResults;
  }

  /** Parse some values used in creating new TLEs */
  private parseTle() {
    this.intl = this.sat.tle1.substring(9, 17);
    this.epochyr = this.sat.tle1.substring(18, 20);
    this.epochday = this.sat.tle1.substring(20, 32);
    this.meanmo = this.sat.tle2.substring(52, 63);
    this.argPer = StringPad.pad0(this.sat.argOfPerigee.toFixed(4), 8);
    this.inc = StringPad.pad0(this.sat.inclination.toFixed(4), 8);
    this.ecen = this.sat.eccentricity.toFixed(7).substring(2, 9);
    // Disregarding the first and second derivatives of mean motion
    // Just keep whatever was in the original TLE
    this.TLE1Ending = this.sat.tle1.substring(32, 71);
  }

  /** Rotate Mean Anomaly 0.1 Degree at a Time for Up To 520 Degrees */
  private meanACalcLoop(now: Date, goalDirection: string) {
    let result = PropagationResults.Near;
    for (let posVal = 0; posVal < 520 * 10; posVal += 1) {
      result = this.meanACalc(posVal, now);
      if (result === PropagationResults.Success) {
        if (this.currentDirection !== goalDirection) {
          // Move 2 Degrees ahead in the orbit to prevent being close on the next lattiude check
          // This happens when the goal latitude is near the poles
          posVal += 20;
        } else {
          break; // Stop changing the Mean Anomaly
        }
      }
      if (result === PropagationResults.Far) {
        posVal += 100;
      }
    }
    return result;
  }

  private raanCalcLoop(raanOffset: number, now: Date) {
    let raanCalcResults = PropagationResults.Near;
    for (let posVal = 0; posVal < 520 * 100; posVal += 1) {
      // 520 degress in 0.01 increments TODO More precise?
      raanCalcResults = this.raanCalc(posVal, raanOffset, now);
      if (raanCalcResults === PropagationResults.Success) {
        break;
      }
      if (raanCalcResults === PropagationResults.Far) {
        posVal += 10 * 100;
      }
    }
    return raanCalcResults;
  }

  /**
   * Rotating the mean anomaly adjusts the latitude (and longitude) of the satellite.
   * @param {number} meana - This is the mean anomaly (where it is along the orbital plane)
   * @returns {PropagationResults} This number tells the main loop what to do next
   */
  private meanACalc(meana: number, now: Date): PropagationResults {
    const sat = this.sat;

    let satrec = sat.satrec || Sgp4.createSatrec(sat.tle1, sat.tle2); // perform and store sat init calcs

    meana = meana / 10;
    const meanaStr = StringPad.pad0(meana.toFixed(4), 8);

    const raan = StringPad.pad0(sat.rightAscension.toFixed(4), 8);

    const argPe = this.newArgPer ? StringPad.pad0((parseFloat(this.newArgPer) / 10).toFixed(4), 8) : StringPad.pad0(sat.argOfPerigee.toFixed(4), 8);

    const _TLE1Ending = sat.tle1.substring(32, 71);
    const tle1 = '1 ' + sat.sccNum + 'U ' + this.intl + ' ' + this.epochyr + this.epochday + _TLE1Ending; // M' and M'' are both set to 0 to put the object in a perfect stable orbit
    const tle2 = '2 ' + sat.sccNum + ' ' + this.inc + ' ' + raan + ' ' + this.ecen + ' ' + argPe + ' ' + meanaStr + ' ' + this.meanmo + '    10';

    satrec = Sgp4.createSatrec(tle1, tle2);
    const results = this.getOrbitByLatLonPropagate(now, satrec, PropagationOptions.MeanAnomaly);
    if (results === PropagationResults.Success) {
      sat.tle1 = tle1 as TleLine1;
      sat.tle2 = tle2 as TleLine2;
      this.newMeana = meanaStr;
    }
    return results;
  }

  private getOrbitByLatLonPropagate(nowIn: Date, satrec: SatelliteRecord, type: PropagationOptions): PropagationResults {
    const { m, gmst } = SatMath.calculateTimeVariables(nowIn, satrec);
    const positionEci = <EciVec3>Sgp4.propagate(satrec, m).position;
    if (isNaN(positionEci.x) || isNaN(positionEci.y) || isNaN(positionEci.z)) {
      return PropagationResults.Error;
    }
    const gpos = eci2lla(positionEci, gmst);

    let { lat: latDeg, lon: lonDeg, alt } = gpos;
    // Set it the first time
    this.lastLat = this.lastLat ? this.lastLat : latDeg;

    if (type === PropagationOptions.MeanAnomaly) {
      if (latDeg === this.lastLat) {
        return 0; // Not enough movement, skip this
      }

      if (latDeg > this.lastLat) {
        this.currentDirection = 'N';
      }
      if (latDeg < this.lastLat) {
        this.currentDirection = 'S';
      }

      this.lastLat = latDeg;
    }

    if (type === PropagationOptions.MeanAnomaly && latDeg > this.goalLat - OrbitFinder.MAX_LAT_ERROR && latDeg < this.goalLat + OrbitFinder.MAX_LAT_ERROR) {
      // Debugging Code:
      // const distance = Math.sqrt(
      //   Math.pow(positionEci.x - initialPosition.x, 2) + Math.pow(positionEci.y - initialPosition.y, 2) + Math.pow(positionEci.z - initialPosition.z, 2)
      // );
      // console.log('Distance from Origin: ' + distance);
      return PropagationResults.Success;
    }

    if (type === PropagationOptions.RightAscensionOfAscendingNode && lonDeg > this.goalLon - OrbitFinder.MAX_LON_ERROR && lonDeg < this.goalLon + OrbitFinder.MAX_LON_ERROR) {
      // Debugging Code:
      // const distance = Math.sqrt(
      //   Math.pow(positionEci.x - initialPosition.x, 2) + Math.pow(positionEci.y - initialPosition.y, 2) + Math.pow(positionEci.z - initialPosition.z, 2)
      // );
      // console.log('Distance from Origin: ' + distance);
      return PropagationResults.Success;
    }

    if (type === PropagationOptions.ArgumentOfPerigee && alt > this.goalAlt - OrbitFinder.MAX_ALT_ERROR && alt < this.goalAlt + OrbitFinder.MAX_ALT_ERROR) {
      // Debugging Code:
      // const distance = Math.sqrt(
      //   Math.pow(positionEci.x - initialPosition.x, 2) + Math.pow(positionEci.y - initialPosition.y, 2) + Math.pow(positionEci.z - initialPosition.z, 2)
      // );
      // console.log('Distance from Origin: ' + distance);
      return PropagationResults.Success;
    }

    // If current latitude greater than 11 degrees off rotate meanA faster
    if (type === PropagationOptions.MeanAnomaly && !(latDeg > this.goalLat - 11 && latDeg < this.goalLat + 11)) {
      return PropagationResults.Far;
    }

    // If current longitude greater than 11 degrees off rotate raan faster
    if (type === PropagationOptions.RightAscensionOfAscendingNode && !(lonDeg > this.goalLon - 11 && lonDeg < this.goalLon + 11)) {
      return PropagationResults.Far;
    }

    // If current altitude greater than 100 km off rotate augPerigee faster
    if (type === PropagationOptions.ArgumentOfPerigee && (alt < this.goalAlt - 100 || alt > this.goalAlt + 100)) {
      return PropagationResults.Far;
    }

    return PropagationResults.Near;
  }

  /**
   * Rotating the mean anomaly adjusts the latitude (and longitude) of the satellite.
   * @param {number} raan - This is the right ascension of the ascending node (where it rises above the equator relative to a specific star)
   * @param {number} raanOffsetIn - This allows the main thread to send a guess of the raan
   * @returns {PropagationResults} This number tells the main loop what to do next
   */
  private raanCalc(raan: number, raanOffsetIn: number, now: Date): PropagationResults {
    const origRaan = raan;
    raan = raan / 100;
    raan = raan > 360 ? raan - 360 : raan;

    const raanStr = StringPad.pad0(raan.toFixed(4), 8);

    // If we adjusted argPe use the new one - otherwise use the old one
    const argPe = this.newArgPer ? StringPad.pad0((parseFloat(this.newArgPer) / 10).toFixed(4), 8) : StringPad.pad0(this.sat.argOfPerigee.toFixed(4), 8);

    const tle1 = '1 ' + this.sat.sccNum + 'U ' + this.intl + ' ' + this.epochyr + this.epochday + this.TLE1Ending; // M' and M'' are both set to 0 to put the object in a perfect stable orbit
    const tle2 = '2 ' + this.sat.sccNum + ' ' + this.inc + ' ' + raanStr + ' ' + this.ecen + ' ' + argPe + ' ' + this.newMeana + ' ' + this.meanmo + '    10';

    const satrec = Sgp4.createSatrec(tle1, tle2);
    const results = this.getOrbitByLatLonPropagate(now, satrec, PropagationOptions.RightAscensionOfAscendingNode);

    // If we have a good guess of the raan, we can use it, but need to apply the offset to the original raan
    if (results === PropagationResults.Success) {
      raan = origRaan / 100 + raanOffsetIn;
      raan = raan > 360 ? raan - 360 : raan;
      raan = raan < 0 ? raan + 360 : raan;

      const _raanStr = StringPad.pad0(raan.toFixed(4), 8);

      const _TLE2 = '2 ' + this.sat.sccNum + ' ' + this.inc + ' ' + _raanStr + ' ' + this.ecen + ' ' + argPe + ' ' + this.newMeana + ' ' + this.meanmo + '    10';

      this.sat.tle1 = tle1 as TleLine1;
      this.sat.tle2 = _TLE2 as TleLine2;
    }
    return results;
  }

  /**
   * We need to adjust the argument of perigee to align a HEO orbit with the desired launch location
   * @param {string} argPe - This is the guess for the argument of perigee (where the lowest part of the orbital plane is)
   * @returns {PropagationResults} This number tells the main loop what to do next
   */
  argPerCalc(argPe: string, now: Date): PropagationResults {
    const meana = this.newMeana;
    const raan = StringPad.pad0(this.sat.rightAscension.toFixed(4), 8);
    argPe = StringPad.pad0((parseFloat(argPe) / 10).toFixed(4), 8);

    // Create the new TLEs
    const tle1 = ('1 ' + this.sat.sccNum + 'U ' + this.intl + ' ' + this.epochyr + this.epochday + this.TLE1Ending) as TleLine1;
    const tle2 = ('2 ' + this.sat.sccNum + ' ' + this.inc + ' ' + raan + ' ' + this.ecen + ' ' + argPe + ' ' + meana + ' ' + this.meanmo + '    10') as TleLine2;

    // Calculate the orbit
    const satrec = Sgp4.createSatrec(tle1, tle2);

    // Check the orbit
    const results = this.getOrbitByLatLonPropagate(now, satrec, PropagationOptions.ArgumentOfPerigee);
    if (results === PropagationResults.Success) {
      this.sat.tle1 = tle1;
      this.sat.tle2 = tle2;
      this.newArgPer = argPe;
    }
    return results;
  }
}
