import { Router } from 'express';

export default function healthRoutes() {
    const router = Router();

    router.get('/health', (req, res) => {
        res.json({ status: 'ok' });
    });

    return router;
}
