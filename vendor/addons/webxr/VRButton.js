class VRButton {

	static createButton( renderer ) {

		const button = document.createElement( 'button' );

		function showEnterVR( /*device*/ ) {

			let currentSession = null, pending = false;

			function onSessionError( error ) {
				pending = false; button.disabled = false; button.textContent = currentSession ? 'ВЫЙТИ ИЗ VR' : 'ВОЙТИ В VR';
				window.dispatchEvent( new CustomEvent( 'game:vr-error', { detail: { name: error?.name || 'Error' } } ) );
			}

			async function onSessionStarted( session ) {

				session.addEventListener( 'end', onSessionEnded );

				currentSession = session;
				try { await renderer.xr.setSession( session ); } catch ( error ) { await session.end().catch( () => {} ); currentSession = null; throw error; }
				if ( currentSession !== session ) return;
				pending = false; button.disabled = false;
				button.textContent = 'ВЫЙТИ ИЗ VR';

			}

			function onSessionEnded( /*event*/ ) {

				currentSession?.removeEventListener( 'end', onSessionEnded );
				pending = false; button.disabled = false;

				button.textContent = 'ВОЙТИ В VR';

				currentSession = null;

			}

			//

			button.style.display = '';

			button.style.cursor = 'pointer';
			button.style.left = 'calc(50% - 75px)';
			button.style.width = '150px';

			button.textContent = 'ВОЙТИ В VR';

			// WebXR's requestReferenceSpace only works if the corresponding feature
			// was requested at session creation time. For simplicity, just ask for
			// the interesting ones as optional features, but be aware that the
			// requestReferenceSpace call will fail if it turns out to be unavailable.
			// ('local' is always available for immersive sessions and doesn't need to
			// be requested separately.)

			const sessionInit = { optionalFeatures: [ 'local-floor', 'bounded-floor', 'hand-tracking', 'layers' ] };

			button.onmouseenter = function () {

				button.style.opacity = '1.0';

			};

			button.onmouseleave = function () {

				button.style.opacity = '0.5';

			};

			button.onclick = function () {
				if ( pending ) return;

				if ( currentSession === null ) {

					pending = true; button.disabled = true;
					navigator.xr.requestSession( 'immersive-vr', sessionInit ).then( onSessionStarted ).catch( onSessionError );

				} else {

					pending = true; button.disabled = true;
					currentSession.end().then( () => {
						if ( navigator.xr.offerSession !== undefined ) {
							return navigator.xr.offerSession( 'immersive-vr', sessionInit ).then( onSessionStarted );
						}
					} ).catch( onSessionError );

				}

			};

			if ( navigator.xr.offerSession !== undefined ) {

				navigator.xr.offerSession( 'immersive-vr', sessionInit )
					.then( onSessionStarted ).catch( onSessionError );

			}

		}

		function disableButton() {

			button.style.display = '';

			button.style.cursor = 'auto';
			button.style.left = 'calc(50% - 110px)';
			button.style.width = '220px';

			button.onmouseenter = null;
			button.onmouseleave = null;

			button.onclick = null;

		}

		function showWebXRNotFound() {

			disableButton();

			button.textContent = 'VR НЕ ПОДДЕРЖИВАЕТСЯ';

		}

		function showVRNotAllowed( exception ) {

			disableButton();

			console.warn( 'Exception when trying to call xr.isSessionSupported', exception );

			button.textContent = 'VR ЗАПРЕЩЁН';

		}

		function stylizeElement( element ) {

			element.style.position = 'absolute';
			element.style.bottom = '20px';
			element.style.padding = '12px 6px';
			element.style.border = '1px solid #fff';
			element.style.borderRadius = '4px';
			element.style.background = 'rgba(0,0,0,0.1)';
			element.style.color = '#fff';
			element.style.font = 'normal 13px sans-serif';
			element.style.textAlign = 'center';
			element.style.opacity = '0.5';
			element.style.outline = 'none';
			element.style.zIndex = '999';

		}

		if ( 'xr' in navigator ) {

			button.id = 'VRButton';
			button.style.display = 'none';

			stylizeElement( button );

			navigator.xr.isSessionSupported( 'immersive-vr' ).then( function ( supported ) {

				supported ? showEnterVR() : showWebXRNotFound();

				if ( supported && VRButton.xrSessionIsGranted ) {

					button.click();

				}

			} ).catch( showVRNotAllowed );

			return button;

		} else {

			const message = document.createElement( 'a' );

			if ( window.isSecureContext === false ) {

				message.href = document.location.href.replace( /^http:/, 'https:' );
				message.innerHTML = 'ДЛЯ WEBXR НУЖЕН HTTPS'; // TODO Improve message

			} else {

				message.href = 'https://immersiveweb.dev/';
				message.innerHTML = 'WEBXR НЕДОСТУПЕН';

			}

			message.style.left = 'calc(50% - 110px)';
			message.style.width = '220px';
			message.style.textDecoration = 'none';

			stylizeElement( message );

			return message;

		}

	}

	static registerSessionGrantedListener() {

		if ( typeof navigator !== 'undefined' && 'xr' in navigator ) {

			// WebXRViewer (based on Firefox) has a bug where addEventListener
			// throws a silent exception and aborts execution entirely.
			if ( /WebXRViewer\//i.test( navigator.userAgent ) ) return;

			navigator.xr.addEventListener( 'sessiongranted', () => {

				VRButton.xrSessionIsGranted = true;

			} );

		}

	}

}

VRButton.xrSessionIsGranted = false;
VRButton.registerSessionGrantedListener();

export { VRButton };
