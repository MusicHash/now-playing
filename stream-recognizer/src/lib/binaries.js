import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';

/**
 * Human-readable fix when a binary is missing (common on WSL without Chromaprint).
 * @param {string} name e.g. fpcalc
 * @param {string} envVar e.g. FPCALC_BIN
 */
export function missingBinaryHint(name, envVar) {
    return (
        `Install ${name} or set ${envVar} to its full path. ` +
        'Debian/Ubuntu/WSL: sudo apt install libchromaprint-tools (provides fpcalc). ' +
        'macOS: brew install chromaprint.'
    );
}

/**
 * @param {NodeJS.ErrnoException} err
 * @param {string} binName
 * @param {string} envVar
 */
export function enrichSpawnError(err, binName, envVar) {
    if (err && err.code === 'ENOENT') {
        return new Error(
            `${binName} not found in PATH (${err.syscall || 'spawn'} ${binName}). ${missingBinaryHint(binName, envVar)}`,
        );
    }
    return err;
}

/**
 * Returns true if the executable appears runnable (exists and not ENOENT).
 * @param {string} cmd from env or default name
 */
export function probeBinary(cmd) {
    if (!cmd || typeof cmd !== 'string') {
        return false;
    }
    if (cmd.includes('/') || cmd.includes('\\')) {
        try {
            accessSync(cmd, constants.X_OK);
            return true;
        } catch {
            try {
                accessSync(cmd, constants.R_OK);
                return true;
            } catch {
                return false;
            }
        }
    }
    const r = spawnSync(cmd, ['-version'], {
        stdio: 'ignore',
        timeout: 5000,
        encoding: 'utf8',
    });
    if (r.error?.code === 'ENOENT') {
        return false;
    }
    return true;
}
