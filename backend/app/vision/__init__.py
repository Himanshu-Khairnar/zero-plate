"""Classical image-processing / computer-vision pipeline for waste photos (Module H).

Every step is a small pure function over numpy arrays (OpenCV BGR convention),
grouped by the topic it demonstrates:

- ``enhance``     - colour-space conversion, denoising, histogram equalisation /
                    CLAHE, contrast stretching, unsharp / high-boost sharpening.
- ``edges``       - Sobel gradient magnitude, Canny, Laplacian of Gaussian,
                    Difference of Gaussians.
- ``frequency``   - 2-D DFT magnitude spectrum, Gaussian low-pass filtering,
                    illumination flattening, texture (high-frequency) energy.
- ``segment``     - plate detection (Hough circle / largest contour), food cue,
                    Otsu threshold, morphology, distance transform + watershed,
                    connected components.
- ``features``    - scale normalisation, rotation normalisation, HOG, colour
                    histogram, Hu moments, Gaussian pyramid.
- ``compression`` - run-length encoding of the binary food mask.
- ``pipeline``    - wires the stages together and times each one.
- ``synthetic``   - reproducible synthetic plates with ground truth.
- ``report``      - ``python -m app.vision.report`` regenerates docs/ipcv/.

This is classical computer vision, not a trained food detector: it measures
*how much* food is on a plate and *how many* portions there are; dish identity
still comes from the outlet's own waste / prep data in ``app.api.vision``.
"""

from app.vision.pipeline import PipelineResult, analyse, decode_image

__all__ = ["PipelineResult", "analyse", "decode_image"]
