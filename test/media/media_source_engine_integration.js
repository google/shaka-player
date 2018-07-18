/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

describe('MediaSourceEngine', function() {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const presentationDuration = 840;

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!MediaSource} */
  let mediaSource;
  /** @type {!shaka.media.MediaSourceEngine} */
  let mediaSourceEngine;
  let generators;
  let metadata;
  // TODO: add text streams to MSE integration tests

  beforeAll(function() {
    video = /** @type {!HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    document.body.appendChild(video);
  });

  beforeEach(async () => {
    metadata = shaka.test.TestScheme.DATA['sintel'];
    generators = shaka.test.TestScheme.GENERATORS['sintel'];

    mediaSourceEngine = new shaka.media.MediaSourceEngine(video);
    mediaSource = /** @type {?} */(mediaSourceEngine)['mediaSource_'];
    expect(video.src).toBeTruthy();
    await mediaSourceEngine.init({}, false);
  });

  afterEach(async () => {
    await mediaSourceEngine.destroy();
  });

  afterAll(function() {
    document.body.removeChild(video);
  });

  function appendInit(type) {
    let segment = generators[type].getInitSegment(Date.now() / 1000);
    return mediaSourceEngine.appendBuffer(type, segment, null, null);
  }

  function append(type, segmentNumber) {
    let segment = generators[type].
        getSegment(segmentNumber, 0, Date.now() / 1000);
    return mediaSourceEngine.appendBuffer(type, segment, null, null);
  }

  function buffered(type, time) {
    return mediaSourceEngine.bufferedAheadOf(type, time);
  }

  function bufferStart(type) {
    return mediaSourceEngine.bufferStart(type);
  }

  function remove(type, segmentNumber) {
    let start = (segmentNumber - 1) * metadata[type].segmentDuration;
    let end = segmentNumber * metadata[type].segmentDuration;
    return mediaSourceEngine.remove(type, start, end);
  }

  function getFakeStream(streamMetadata) {
    return {
      mimeType: streamMetadata.mimeType,
      codecs: streamMetadata.codecs,
    };
  }

  it('buffers MP4 video', async () => {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);
    await appendInit(ContentType.VIDEO);
    expect(buffered(ContentType.VIDEO, 0)).toBe(0);
    await append(ContentType.VIDEO, 1);
    expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(10);
    await append(ContentType.VIDEO, 2);
    expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(20);
    await append(ContentType.VIDEO, 3);
    expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(30);
  });

  it('removes segments', async () => {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);
    await appendInit(ContentType.VIDEO);
    await Promise.all([
      append(ContentType.VIDEO, 1),
      append(ContentType.VIDEO, 2),
      append(ContentType.VIDEO, 3),
    ]);
    expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(30);
    await remove(ContentType.VIDEO, 1);
    expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(10);
    expect(buffered(ContentType.VIDEO, 10)).toBeCloseTo(20);
    await remove(ContentType.VIDEO, 2);
    expect(bufferStart(ContentType.VIDEO)).toBe(20);
    expect(buffered(ContentType.VIDEO, 20)).toBeCloseTo(10);
    await remove(ContentType.VIDEO, 3);
    expect(bufferStart(ContentType.VIDEO)).toBe(null);
  });

  it('extends the duration', async () => {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(0);
    await appendInit(ContentType.VIDEO);
    await mediaSourceEngine.setDuration(20);
    expect(mediaSource.duration).toBeCloseTo(20);
    await append(ContentType.VIDEO, 1);
    expect(mediaSource.duration).toBeCloseTo(20);
    await mediaSourceEngine.setDuration(35);
    expect(mediaSource.duration).toBeCloseTo(35);
    await Promise.all([
      append(ContentType.VIDEO, 2),
      append(ContentType.VIDEO, 3),
      append(ContentType.VIDEO, 4),
    ]);
    expect(mediaSource.duration).toBeCloseTo(40);
    await mediaSourceEngine.setDuration(60);
    expect(mediaSource.duration).toBeCloseTo(60);
  });

  it('ends the stream, truncating the duration', async () => {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);
    await appendInit(ContentType.VIDEO);
    await append(ContentType.VIDEO, 1);
    await append(ContentType.VIDEO, 2);
    await append(ContentType.VIDEO, 3);
    await mediaSourceEngine.endOfStream();
    expect(mediaSource.duration).toBeCloseTo(30);
  });

  it('queues operations', function(done) {
    let resolutionOrder = [];
    let requests = [];

    function checkOrder(p) {
      let nextIndex = requests.length;
      requests.push(p);
      p.then(function() { resolutionOrder.push(nextIndex); });
    }

    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    mediaSourceEngine.init(initObject, false).then(() => {
      checkOrder(mediaSourceEngine.setDuration(presentationDuration));
      checkOrder(appendInit(ContentType.VIDEO));
      checkOrder(append(ContentType.VIDEO, 1));
      checkOrder(append(ContentType.VIDEO, 2));
      checkOrder(append(ContentType.VIDEO, 3));
      checkOrder(mediaSourceEngine.endOfStream());

      return Promise.all(requests);
    }).then(() => {
      expect(resolutionOrder).toEqual([0, 1, 2, 3, 4, 5]);
    }).catch(fail).then(done);
  });

  it('buffers MP4 audio', async () => {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.AUDIO] = getFakeStream(metadata.audio);
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);
    // NOTE: For some reason, this appendInit never resolves on my Windows VM.
    // The test operates correctly on real hardware.
    await appendInit(ContentType.AUDIO);
    expect(buffered(ContentType.AUDIO, 0)).toBe(0);
    await append(ContentType.AUDIO, 1);
    expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(10, 1);
    await append(ContentType.AUDIO, 2);
    expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(20, 1);
    await append(ContentType.AUDIO, 3);
    expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(30, 1);
  });

  it('buffers MP4 video and audio', async () => {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.AUDIO] = getFakeStream(metadata.audio);
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);

    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);

    let audioStreaming = appendInit(ContentType.AUDIO).then(() => {
      return append(ContentType.AUDIO, 1);
    }).then(() => {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(10, 1);
      return append(ContentType.AUDIO, 2);
    }).then(() => {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(20, 1);
      return append(ContentType.AUDIO, 3);
    }).then(() => {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(30, 1);
      return append(ContentType.AUDIO, 4);
    }).then(() => {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(40, 1);
      return append(ContentType.AUDIO, 5);
    }).then(() => {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(50, 1);
      return append(ContentType.AUDIO, 6);
    }).then(() => {
      expect(buffered(ContentType.AUDIO, 0)).toBeCloseTo(60, 1);
    });

    let videoStreaming = appendInit(ContentType.VIDEO).then(() => {
      return append(ContentType.VIDEO, 1);
    }).then(() => {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(10);
      return append(ContentType.VIDEO, 2);
    }).then(() => {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(20);
      return append(ContentType.VIDEO, 3);
    }).then(() => {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(30);
      return append(ContentType.VIDEO, 4);
    }).then(() => {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(40);
      return append(ContentType.VIDEO, 5);
    }).then(() => {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(50);
      return append(ContentType.VIDEO, 6);
    }).then(() => {
      expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(60);
    });

    await Promise.all([audioStreaming, videoStreaming]);
    await mediaSourceEngine.endOfStream();
    expect(mediaSource.duration).toBeCloseTo(60, 1);
  });

  it('trims content at the append window', async () => {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);
    await appendInit(ContentType.VIDEO);
    await mediaSourceEngine.setStreamProperties(ContentType.VIDEO,
                                                /* timestampOffset */ 0,
                                                /* appendWindowStart */ 5,
                                                /* appendWindowEnd */ 18);
    expect(buffered(ContentType.VIDEO, 0)).toBe(0);
    await append(ContentType.VIDEO, 1);
    expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(5, 1);
    expect(buffered(ContentType.VIDEO, 5)).toBeCloseTo(5, 1);
    await append(ContentType.VIDEO, 2);
    expect(buffered(ContentType.VIDEO, 5)).toBeCloseTo(13, 1);
  });

  it('does not remove when overlap is outside append window', async () => {
    // Create empty object first and initialize the fields through
    // [] to allow field names to be expressions.
    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    await mediaSourceEngine.init(initObject, false);
    await mediaSourceEngine.setDuration(presentationDuration);
    await appendInit(ContentType.VIDEO);
    // Simulate period 1, with 20 seconds of content, no timestamp offset
    await mediaSourceEngine.setStreamProperties(ContentType.VIDEO,
                                                /* timestampOffset */ 0,
                                                /* appendWindowStart */ 0,
                                                /* appendWindowEnd */ 20);
    await append(ContentType.VIDEO, 1);
    await append(ContentType.VIDEO, 2);
    expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(0, 1);
    expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(20, 1);

    // Simulate period 2, with 20 seconds of content offset back by 5 seconds.
    // The 5 seconds of overlap should be trimmed off, and we should still
    // have a continuous stream with 35 seconds of content.
    await mediaSourceEngine.setStreamProperties(ContentType.VIDEO,
                                                /* timestampOffset */ 15,
                                                /* appendWindowStart */ 20,
                                                /* appendWindowEnd */ 35);
    await append(ContentType.VIDEO, 1);
    await append(ContentType.VIDEO, 2);
    expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(0, 1);
    expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(35, 1);
  });

  it('extracts CEA-708 captions', async () => {
    // Load TS files with CEA-708 captions.
    metadata = shaka.test.TestScheme.DATA['cea-708_ts'];
    generators = shaka.test.TestScheme.GENERATORS['cea-708_ts'];

    // Create a mock text displayer, to intercept text cues.
    let cues = [];
    let mockTextDisplayer = /** @type {shaka.extern.TextDisplayer} */ ({
      append: (newCues) => { cues = cues.concat(newCues); },
    });
    mediaSourceEngine.setTextDisplayer(mockTextDisplayer);

    let initObject = {};
    initObject[ContentType.VIDEO] = getFakeStream(metadata.video);
    mediaSourceEngine.setUseEmbeddedText(true);
    // Call with forceTransmuxTS = true, so that it will transmux even on
    // platforms with native TS support.
    await mediaSourceEngine.init(initObject, /** forceTransmuxTS */ true);
    await append(ContentType.VIDEO, 0);
    expect(bufferStart(ContentType.VIDEO)).toBeCloseTo(1, 0);
    expect(buffered(ContentType.VIDEO, 0)).toBeCloseTo(20, 1);
    expect(cues.length).toBe(3);
  });
});
