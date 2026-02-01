"""Base provider class for AI providers."""
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, Type


class BaseProvider(ABC):
    """Abstract base class for AI providers."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    @abstractmethod
    async def generate_stream(
        self,
        model: str,
        messages: list[dict],
        system_prompt: str = "",
        images: list = None
    ) -> AsyncGenerator[str, None]:
        """Generate streaming response from the model.

        Args:
            model: Model ID to use
            messages: List of message dicts with role and content
            system_prompt: Optional system prompt
            images: Optional list of image dicts with 'base64' and 'media_type' keys (for vision models)
        """
        pass

    @abstractmethod
    async def test_connection(self) -> bool:
        """Test if the API key is valid."""
        pass


class ProviderRegistry:
    """Registry for AI providers."""

    _providers: Dict[str, Type[BaseProvider]] = {}

    @classmethod
    def register(cls, name: str, provider_class: Type[BaseProvider]):
        """Register a provider."""
        cls._providers[name] = provider_class

    @classmethod
    def get(cls, name: str) -> Type[BaseProvider]:
        """Get a provider class by name."""
        if name not in cls._providers:
            raise ValueError(f"Unknown provider: {name}")
        return cls._providers[name]

    @classmethod
    def list_providers(cls) -> list[str]:
        """List all registered providers."""
        return list(cls._providers.keys())
