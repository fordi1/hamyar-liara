import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';

// Platform login is explicitly disabled. Do not redirect visitors to an auth UI.
// The outer workspace/ingress boundary remains controlled by the host.
export function proxy(_request:NextRequest){return NextResponse.next();}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
