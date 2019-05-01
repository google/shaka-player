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

/**
 * @fileoverview Externs for picture-in-picture methods.
 * @externs
 */

/**
 * @return {!Promise}
 */
HTMLDocument.prototype.exitPictureInPicture = function() {};


/** @type {Element} */
HTMLDocument.prototype.pictureInPictureElement;


/** @type {boolean} */
HTMLDocument.prototype.pictureInPictureEnabled;


/** @type {Element} */
HTMLDocument.prototype.polyfillPictureInPictureElement;


/**
 * @return {!Promise}
 */
HTMLMediaElement.prototype.requestPictureInPicture = function() {};


/** @type {boolean} */
HTMLMediaElement.prototype.disablePictureInPicture;


/**
 * @param {string} mode
 * @return {boolean}
 */
HTMLMediaElement.prototype.webkitSetPresentationMode = function(mode) {};


/**
 * @param {string} mode
 * @return {boolean}
 */
HTMLMediaElement.prototype.webkitSupportsPresentationMode = function(mode) {};


/** @type {string} */
HTMLMediaElement.prototype.webkitPresentationMode;


/** @type {Object} */
HTMLMediaElement.prototype.polyfillEnterpictureinpicture;


/** @type {Object} */
HTMLMediaElement.prototype.polyfillLeavepictureinpicture;


/** @type {string} */
HTMLMediaElement.prototype.polyfillPreviousPresentationMode;
